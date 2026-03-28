# Driver App

Expo app separated from the web dispatcher.

## Purpose

- Driver login
- Real GPS tracking from the phone
- Active trip view
- Status updates like en route, arrived, completed
- Future sync with the dispatcher web app

## Current Base

- Expo TypeScript app
- GPS permission flow with `expo-location`
- Live location watcher
- Driver shift state buttons
- Placeholder backend URL for future sync

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

- Replace `YOUR-COMPUTER-IP` with the local IP of the machine running the web dispatcher.
- Phone cannot use `localhost` to reach your web server.
- Dispatcher web is currently running separately and should remain separate from this app.

## Next Recommended Steps

- Add real backend login
- Add trip pull from dispatcher
- Add POST endpoint for driver GPS updates
- Add background location tracking for active shifts