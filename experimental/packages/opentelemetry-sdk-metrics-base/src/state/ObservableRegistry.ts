/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ObservableCallback } from '@opentelemetry/api-metrics';
import { ObservableResult } from '../ObservableResult';
import { callWithTimeout, PromiseAllSettled, isPromiseAllSettledRejectionResult } from '../utils';
import { AsyncWritableMetricStorage } from './WritableMetricStorage';

/**
 * An internal state interface for ObservableCallbacks.
 *
 * An ObservableCallback can be bound to multiple AsyncMetricStorage at once
 * for batch observations. And an AsyncMetricStorage may be bound to multiple
 * callbacks too.
 *
 * However an ObservableCallback must not be called multiple times during a
 * single collection operation.
 */
export class ObservableRegistry {
  private _callbacks: [ObservableCallback, AsyncWritableMetricStorage][] = [];

  addCallback(callback: ObservableCallback, metricStorage: AsyncWritableMetricStorage) {
    this._callbacks.push([callback, metricStorage]);
  }

  /**
   * @returns a promise of rejected reasons for invoking callbacks.
   */
  async observe(timeoutMillis?: number): Promise<unknown[]> {
    // TODO: batch observables
    // https://github.com/open-telemetry/opentelemetry-specification/pull/2363
    const results = await PromiseAllSettled(this._callbacks
      .map(async ([observableCallback, metricStorage]) => {
        const observableResult = new ObservableResult();
        let callPromise: Promise<void> = Promise.resolve(observableCallback(observableResult));
        if (timeoutMillis != null) {
          callPromise = callWithTimeout(callPromise, timeoutMillis);
        }
        await callPromise;
        metricStorage.record(observableResult.buffer);
      })
    );

    const rejections = results.filter(isPromiseAllSettledRejectionResult)
      .map(it => it.reason);
    return rejections;
  }
}
