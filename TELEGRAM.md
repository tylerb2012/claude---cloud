# Run the paper app as a Telegram Mini App

A Telegram Mini App is a web page that your bot opens inside Telegram. You need two things: the page online at an `https://` address, and a bot that points to it. You don't need a server or any code for the bot. All the steps work from a phone.

Inside Telegram the app follows Telegram's light/dark theme, fills the screen, uses Telegram's back button to close coin sheets, vibrates lightly on buys and sells, and shows your first name on the Profile tab. It stays play money: no wallet, no deposits, no payments.

## 1. Put the app online (Vercel, free)

1. Open **vercel.com** and sign in with GitHub.
2. Tap **Add New… → Project** and import **claude---cloud**. If it isn't listed, use "Adjust GitHub App Permissions" to give Vercel access to that repo.
3. Leave the settings as detected (Framework: **Vite**, Build command `npm run build`, Output `dist`) and tap **Deploy**.
4. Vercel builds from the repo's default branch. If the app lives on another branch (it's on `claude/gifted-wozniak-z402m0` now), either merge it into the default branch or set **Settings → Git → Production Branch** to that branch, then redeploy.
5. When it's done you get an address like `https://claude-cloud-xyz.vercel.app`. The mini app is at **`https://<your-address>/mini.html`**. Open it in your phone's browser once to check it loads.

## 2. Create your bot

1. In Telegram, open **@BotFather** (the official one, with the blue check).
2. Send `/newbot`, then pick a display name and a username ending in `bot`, e.g. `MyVenueBot`.
3. BotFather replies with a **token**. You don't need it for this, so don't paste it anywhere: anyone with it controls your bot.

## 3. Connect the app to the bot

Either option works, and you can do both:

- **Menu button** (opens from the bot's chat): in @BotFather send `/mybots`, choose your bot, then **Bot Settings → Menu Button**. Send the URL `https://<your-address>/mini.html` and a button title such as `Open`.
- **Direct link** (shareable `t.me` link): in @BotFather send `/newapp`, choose your bot, and follow the prompts. It asks for a title, a short description, a 640×360 photo, the URL `https://<your-address>/mini.html` and a short name like `play`. Your link becomes `https://t.me/<YourBot>/<shortname>`.

BotFather's menus change now and then. If a button has moved, look under **Bot Settings** for "Menu Button" or "Configure Mini App".

## 4. Open it

Open your bot's chat and tap the menu button, or open the `t.me/<YourBot>/<shortname>` link. Changes you push to the repo redeploy on Vercel automatically.

## Keep it honest

- Everything in the app is simulated, and it's labeled **PAPER** on every screen.
- Don't add deposit addresses, generated wallets, "activation" fees or paid referral rewards. Those are what make the scam bots work.
- If you share the link, the "Spot a scam bot" card on the Profile tab is there for your friends too.
