# Privacy and data handling

This document describes the checked-in application's behavior. A hosting provider or modified deployment can add its own logging and policies.

## Local data

Account settings, editable drafts, pasted signal text, and saved trade history are stored on the device through Capacitor Preferences or browser localStorage. Theme selection is also local. There is no account registration, application backend, cloud synchronization, or analytics integration in the current source.

Saved trades include prices, calculated position details, timestamps, and source text where applicable. Local preferences are not an encrypted trading vault. Do not include account credentials in pasted signals.

Clearing the browser's site data or Android app storage removes local data. There is no cloud restore or history export workflow in this version.

## Images and clipboard

Android screenshot OCR uses a bundled ML Kit text recognizer on the device. The app passes the selected image to its native plugin and does not upload it to an OCR service. Drafts and history store trade text and results, not the screenshot image itself.

Clipboard access supports explicit paste and copy actions. Copied values become available to the device clipboard; copying also saves the calculated trade locally.

## Network requests

The app requests currency conversions from `api.frankfurter.dev`. Requests contain currency codes, not account balances, trade prices, screenshots, or signal text. The provider receives normal connection information such as the requesting IP address. Conversions can be cached locally or entered manually where supported.

The catalog is bundled and does not trigger runtime requests to FTMO. A hosted web build also requests its static assets from its host. README badges are GitHub documentation assets, not application tracking code.
