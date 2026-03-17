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

import { CoreBiometric } from '@features/login/services/biometric';
import { CoreSettingsHandler, CoreSettingsHandlerData } from '@features/settings/services/settings-delegate';
import { CoreAlerts } from '@services/overlays/alerts';
import { makeSingleton, Translate } from '@singletons';

/**
 * Biometric unlock settings handler.
 */
@Injectable({ providedIn: 'root' })
export class CoreBiometricSettingsHandlerService implements CoreSettingsHandler {

    name = 'CoreBiometricSettingsHandler';
    priority = 200;

    protected toggleChecked = false;

    /**
     * @inheritdoc
     */
    async isEnabled(): Promise<boolean> {
        this.toggleChecked = await CoreBiometric.isEnabledForSite();

        return CoreBiometric.canUseBiometric();
    }

    /**
     * @inheritdoc
     */
    getDisplayData(): CoreSettingsHandlerData {
        const data: {
            icon: string;
            title: string;
            toggleChecked: boolean;
            toggle: (checked: boolean) => Promise<void>;
            class: string;
        } = {
            icon: 'fas-fingerprint',
            title: 'core.settings.biometricunlock',
            toggleChecked: this.toggleChecked,
            toggle: async (checked: boolean) => {
                try {
                    data.toggleChecked = await CoreBiometric.setEnabledForSite(checked);
                } catch (error) {
                    data.toggleChecked = false;

                    CoreAlerts.showError(error, {
                        default: Translate.instant('core.settings.biometricunlockfailed'),
                    });
                }
            },
            class: 'core-biometric-settings-handler',
        };

        return data;
    }

}

export const CoreBiometricSettingsHandler = makeSingleton(CoreBiometricSettingsHandlerService);
