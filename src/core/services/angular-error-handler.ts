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

import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Error handler that prints stack traces explicitly.
 *
 * In some Android WebView builds, `console.error('ERROR', error)` can lose the stack trace
 * in `logcat`, making startup issues (white screen) hard to diagnose.
 */
@Injectable()
export class CoreAngularErrorHandler extends ErrorHandler {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    override handleError(error: any): void {
        // eslint-disable-next-line no-console
        console.error('ANGULAR_ERROR', error?.stack || error);

        super.handleError(error);
    }

}

