# myREWRD TV Box — Setup Guide

**Hardware:** GMKtec G3S Mini PC (Intel N95, 8GB RAM, 256GB SSD)

---

## What's in the Box

- GMKtec G3S Mini PC
- Power adapter
- HDMI cable
- VESA mount bracket + screws
- User manual (ignore it)

## What You'll Also Need

- A TV with an available HDMI port
- WiFi network name + password for the venue (or your home for testing)
- A USB mouse (just for initial setup — remove after)
- A USB keyboard (just for initial setup — remove after)

---

## STEP 1: Unbox & Connect (2 minutes)

1. Take the mini PC out of the box
2. Plug the **HDMI cable** into the mini PC and into your TV
3. Plug the **power adapter** into the mini PC and into a wall outlet
4. Plug in a **USB mouse** and **USB keyboard** (temporarily)
5. Turn on the TV and switch to the correct HDMI input
6. Press the **power button** on the mini PC (red button on front)
7. Wait ~30 seconds — Windows will boot up

---

## STEP 2: Windows First-Time Setup (5 minutes)

Windows 11 will walk you through initial setup:

1. **Region:** United States → Next
2. **Keyboard:** US → Next, skip second keyboard
3. **Network:** Connect to your WiFi network (enter password)
4. **Name this PC:** Type `MYREWRD-TV-001` (or whatever number) → Next
5. **How would you like to set up?** → Choose "Set up for personal use"
6. **Microsoft Account:** Click "Sign-in options" → "Offline account" → "Limited experience"
7. **Username:** Type `myrewrd` → Next
8. **Password:** Leave BLANK (no password) → Next → Next → Next
9. **Privacy settings:** Turn everything OFF → Accept
10. Wait for Windows to finish setting up (2-3 minutes)

You'll land on the Windows desktop.

---

## STEP 3: Install Chrome (3 minutes)

1. Open **Microsoft Edge** (blue icon on taskbar)
2. Go to: `google.com/chrome`
3. Click **Download Chrome** → Run the installer
4. Wait for Chrome to install and open
5. When Chrome asks to be default browser → Click **Yes**
6. Close Edge — you won't need it again

---

## STEP 4: Set Up the TV Board (2 minutes)

1. In Chrome, go to: `https://app.myrewrd.com/tv/PASTE_TV_TOKEN_HERE`
   
   **To get the TV token:**
   - Log into https://app.myrewrd.com
   - Go to the venue's TV Board settings
   - Copy the TV Board URL (looks like: `https://app.myrewrd.com/tv/tv_abc123...`)
   - Paste that full URL into Chrome on the mini PC

2. You should see the TV Board loading with the venue's lineup
3. Press **F11** to go full-screen (hides the browser toolbar)

---

## STEP 5: Make It Auto-Start (3 minutes)

This makes the TV Board open automatically every time the mini PC turns on — no mouse/keyboard needed.

1. Press **Windows key + R** (opens Run dialog)
2. Type: `shell:startup` → press Enter
3. A folder opens. Right-click in the empty space → **New** → **Shortcut**
4. For the location, paste this (replace YOUR_TV_TOKEN with the actual token):
   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --start-fullscreen https://app.myrewrd.com/tv/YOUR_TV_TOKEN
   ```
5. Click Next → Name it `myREWRD TV` → Click Finish
6. Close the folder

---

## STEP 6: Disable Sleep & Screen Lock (2 minutes)

The mini PC must never sleep or lock the screen.

1. Right-click the desktop → **Display settings**
2. Scroll down → Click **Screen and sleep** (or search "Power" in Settings)
3. Set ALL options to **Never**:
   - Screen: Never turn off
   - Sleep: Never
4. Go to **Settings** → **Accounts** → **Sign-in options**
5. Under "Require sign-in" → set to **Never**

---

## STEP 7: Test It (1 minute)

1. Restart the mini PC (Start → Power → Restart)
2. Wait ~45 seconds
3. The TV Board should automatically open full-screen in Chrome
4. Verify you see the venue's artist lineup or "Game Day" mode

**If it works:** Remove the USB mouse and keyboard. You're done.

---

## STEP 8: Mount Behind the TV (Optional)

Use the included VESA mount bracket to attach the mini PC to the back of the TV:

1. Screw the VESA bracket to the back of the TV (use the 4 screw holes)
2. Clip the mini PC onto the bracket
3. Route the HDMI cable and power cable neatly
4. The mini PC is now hidden — out of sight, out of mind

---

## How to Control It

Once set up, you NEVER need to touch the mini PC again. Control everything from:

- **Your phone:** Profile → TV Control (switch Regular/Stream/Game Day)
- **Dashboard:** TV Board settings page (set stream URLs, sponsors, etc.)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Black screen on TV | Check HDMI input on TV, check power on mini PC |
| TV Board not loading | Check WiFi connection, restart mini PC |
| Chrome not opening on boot | Re-do Step 5 (startup shortcut) |
| Screen goes black after a while | Re-do Step 6 (disable sleep) |
| Need to change venue/token | Plug in mouse + keyboard, edit the startup shortcut |
| WiFi changed at venue | Plug in mouse + keyboard, connect to new WiFi |

---

## For Platform Admins: Provisioning Multiple Boxes

When setting up boxes in bulk before shipping to venues:

1. Complete Steps 1-6 on each box
2. Name each PC sequentially: `MYREWRD-TV-001`, `MYREWRD-TV-002`, etc.
3. For Step 4, use a placeholder URL — you'll update it per-venue later
4. Register each box in the dashboard: Platform → TV Devices
5. Ship the box to the venue with a one-page instruction card:
   - "Plug HDMI into TV, plug power into wall, turn on TV to correct input"

That's it. The venue literally just plugs in two cables.

---

## Total Setup Time: ~15 minutes per box

Once you've done it once, each additional box takes about 10 minutes.
