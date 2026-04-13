# Investment Tracker

A React investment tracker for SIPs and mutual funds.

## What it does

- Opens a new portfolio with a name, phone number, and 6 digit passcode.
- Logs into an existing portfolio with only the mobile number and passcode.
- Uses the phone number as the unique profile identifier.
- Stores each profile's funds in the browser with `localStorage`.
- Calculates invested months from the SIP start date.
- Calculates total invested amount automatically as months pass.
- Supports optional current value or return percentage for profit and return calculations.
- Generates a monthly tracker for each fund.
- Uses Framer Motion for page, form, and portfolio animations.

## Run locally

Install dependencies, then start Vite:

```bash
npm install
npm run dev
```

## Free hosting

This app can be hosted as a React static site on GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

The current version stores data in the user's browser. For true login across devices, connect a hosted database/auth service such as Firebase or Supabase before publishing for multiple people.
