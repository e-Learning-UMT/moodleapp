// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';

import { CoreConstants } from '@/core/constants';
import { CoreSite } from '@classes/sites/site';
import { CoreApp } from '@services/app';
import { CorePlatform } from '@services/platform';
import { CoreSites } from '@services/sites';
import { CoreStorage } from '@services/storage';
import { makeSingleton, Translate } from '@singletons';

/**
 * Service to manage biometric unlock for a site.
 */
@Injectable({ providedIn: 'root' })
export class CoreBiometricProvider {

    protected static readonly ENABLED_KEY = 'CoreBiometricUnlockEnabled';
    protected static readonly SECRET_PREFIX = 'biometric-site-';
    protected static readonly RESUME_GRACE_PERIOD = 5000;

    protected unlockInProgress?: Promise<boolean>;
    protected pauseTimestamp?: number;
    protected coldStartHandled = false;

    /**
     * Initialize service.
     */
    initialize(): void {
        CorePlatform.pause.subscribe(() => {
            this.pauseTimestamp = Date.now();
        });

        CorePlatform.resume.subscribe(() => {
            void this.handleAppResume();
        });
    }

    /**
     * Whether biometrics can be configured on this device.
     *
     * @returns Whether biometrics are available.
     */
    async canUseBiometric(): Promise<boolean> {
        try {
            await this.getAvailableBiometricType();

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Whether biometric unlock is enabled for a site.
     *
     * @param site Site.
     * @returns Whether it is enabled.
     */
    async isEnabledForSite(site?: CoreSite): Promise<boolean> {
        site = site ?? CoreSites.getCurrentSite();

        if (!site) {
            return false;
        }

        const storage = await CoreStorage.forSite(site);

        return storage.get(CoreBiometricProvider.ENABLED_KEY, false);
    }

    /**
     * Enable or disable biometric unlock for a site.
     *
     * @param enabled Whether it should be enabled.
     * @param site Site.
     * @returns Final state.
     */
    async setEnabledForSite(enabled: boolean, site?: CoreSite): Promise<boolean> {
        site = site ?? CoreSites.getCurrentSite();

        if (!site) {
            return false;
        }

        const storage = await CoreStorage.forSite(site);

        if (!enabled) {
            await storage.set(CoreBiometricProvider.ENABLED_KEY, false);

            return false;
        }

        await this.registerSiteSecret(site);
        await storage.set(CoreBiometricProvider.ENABLED_KEY, true);

        return true;
    }

    /**
     * Require biometric authentication after restoring a session on app startup.
     */
    async handleColdStartUnlock(): Promise<void> {
        if (this.coldStartHandled) {
            return;
        }

        this.coldStartHandled = true;

        const site = CoreSites.getCurrentSite();
        if (!site || !await this.isEnabledForSite(site)) {
            return;
        }

        const unlocked = await this.authenticateSite(site, 'core.settings.biometricunlockstartup');

        if (!unlocked) {
            CoreApp.closeApp();
        }
    }

    /**
     * Handle app resume.
     */
    protected async handleAppResume(): Promise<void> {
        const site = CoreSites.getCurrentSite();

        if (!site || !await this.isEnabledForSite(site)) {
            return;
        }

        if (
            this.pauseTimestamp &&
            (Date.now() - this.pauseTimestamp) < CoreBiometricProvider.RESUME_GRACE_PERIOD
        ) {
            return;
        }

        const unlocked = await this.authenticateSite(site, 'core.settings.biometricunlockresume');

        if (!unlocked) {
            CoreApp.closeApp();
        }
    }

    /**
     * Authenticate access to a site.
     *
     * @param site Site.
     * @param descriptionKey Translate key for prompt description.
     * @returns Whether authentication succeeded.
     */
    protected async authenticateSite(site: CoreSite, descriptionKey: string): Promise<boolean> {
        if (this.unlockInProgress) {
            return this.unlockInProgress;
        }

        this.unlockInProgress = this.loadSiteSecret(site, descriptionKey)
            .then(secret => secret === this.getSecret(site))
            .catch(async () => {
                await this.setEnabledForSite(false, site);

                return false;
            })
            .finally(() => {
                delete this.unlockInProgress;
            });

        return this.unlockInProgress;
    }

    /**
     * Register a secret protected by biometrics for the site.
     *
     * @param site Site.
     */
    protected async registerSiteSecret(site: CoreSite): Promise<void> {
        const fingerprint = await this.getFingerprintPlugin();

        await new Promise<void>((resolve, reject) => {
            fingerprint.registerBiometricSecret({
                secret: this.getSecret(site),
                description: Translate.instant('core.settings.biometricunlockenable'),
                title: CoreConstants.CONFIG.appname,
                confirmationRequired: false,
            }, resolve, reject);
        });
    }

    /**
     * Load a site secret after authenticating with biometrics.
     *
     * @param site Site.
     * @param descriptionKey Translate key for prompt description.
     * @returns Loaded secret.
     */
    protected async loadSiteSecret(site: CoreSite, descriptionKey: string): Promise<string> {
        const fingerprint = await this.getFingerprintPlugin();

        return new Promise<string>((resolve, reject) => {
            fingerprint.loadBiometricSecret({
                description: Translate.instant(descriptionKey),
                title: CoreConstants.CONFIG.appname,
                confirmationRequired: false,
            }, resolve, reject);
        });
    }

    /**
     * Get the available biometric type or fail if not supported.
     *
     * @returns Biometric type.
     */
    protected async getAvailableBiometricType(): Promise<string> {
        const fingerprint = await this.getFingerprintPlugin();

        return new Promise<string>((resolve, reject) => {
            fingerprint.isAvailable(resolve, reject, { allowBackup: false });
        });
    }

    /**
     * Get the fingerprint plugin or fail if unavailable.
     *
     * @returns Fingerprint plugin.
     */
    protected async getFingerprintPlugin(): Promise<NonNullable<Window['Fingerprint']>> {
        await CorePlatform.ready();

        if (!CorePlatform.isMobile() || !window.Fingerprint) {
            throw new Error('Biometric authentication is not available on this device.');
        }

        return window.Fingerprint;
    }

    /**
     * Build the secret stored behind the biometric prompt.
     *
     * @param site Site.
     * @returns Secret.
     */
    protected getSecret(site: CoreSite): string {
        return `${CoreBiometricProvider.SECRET_PREFIX}${site.getId()}`;
    }

}

export const CoreBiometric = makeSingleton(CoreBiometricProvider);
