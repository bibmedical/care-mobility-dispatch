# Driver App

Expo app for the driver mobile rebuild.

## Current State

`V1` is complete and `V2` is now started.

The app now includes:

- modular Expo structure under `src/`
- shared runtime hook for driver session, trip sync, and GPS foundation
- screen split between login and driver home
- tabs for `Today`, `Active Trip`, `Messages`, and `Settings`
- visible roadmap from `V1` through `V8`
- mobile login endpoint backed by shared driver records
- persistent Expo driver session restore

## Roadmap

### V1

- app shell and structure
- config and API foundation
- runtime hook
- visible roadmap inside app

### V2

- real driver login endpoint
- persistent session
- logout and session restore
- current PIN fallback: last 4 digits of the driver phone unless `mobilePin` is set in the shared driver record

### V3

- assigned trips for today
- active trip detail
- dispatcher notes in app

### V4

- en route
- arrived
- picked up
- dropped off
- delay and no-show actions

### V5

- real foreground GPS sync
- checkpoint updates
- online-offline visibility in dispatcher

### V6

- background GPS on Android
- EAS builds and physical device testing
- tracking hardening for operations

### V7

- dispatcher alerts
- trip changes and cancellations
- driver message center

### V8

- offline resilience
- crash logging
- push notifications
- release hardening

## Existing Backend Base

Right now the driver app can already read assigned trips from:

`/api/mobile/driver-trips?driverCode=...`

That is still a starter endpoint and will need expansion in later versions.

## Run

```bash
npm start
```

Then use one of:

```bash
npm run android
npm run web
```

## Important

- Replace `YOUR-COMPUTER-IP` with the machine IP running the web server.
- A real phone cannot use `localhost` to reach the web backend.
- For real GPS production work, plan around `EAS Build` and device testing, especially for background tracking.