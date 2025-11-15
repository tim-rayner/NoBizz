# Troubleshooting: Extension Popup Not Opening

If clicking the extension badge does nothing, follow these steps:

## 1. Check Extension is Built and Loaded

1. **Build the extension:**
   ```bash
   cd apps/nobizz-extension
   pnpm dev
   # or
   pnpm build
   ```

2. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Navigate to `apps/nobizz-extension/build/chrome-mv3-dev`
   - The extension should appear in your list

3. **Verify it's enabled:**
   - Make sure the toggle next to your extension is ON (blue)

## 2. Check Console for Errors

1. **Open Popup DevTools:**
   - Right-click the extension icon in Chrome toolbar
   - Select "Inspect popup"
   - OR go to `chrome://extensions/` → Find your extension → Click "Inspect views: popup"

2. **Look for logs:**
   - You should see logs starting with `[Popup] Component file loaded`
   - If you don't see ANY logs, the popup isn't loading at all

3. **Check for errors:**
   - Red errors in console indicate what's broken
   - Common issues:
     - Missing environment variables
     - Import errors
     - Syntax errors

## 3. Check Environment Variables

1. **Create `.env` file:**
   ```bash
   cd apps/nobizz-extension
   cp .env.example .env
   ```

2. **Fill in values:**
   ```
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Rebuild:**
   ```bash
   pnpm dev
   ```

## 4. Check Manifest

The extension should have these permissions in `package.json`:
```json
"manifest": {
  "permissions": ["activeTab", "tabs"],
  "host_permissions": ["https://*/*"]
}
```

## 5. Verify Content Script is Loading

1. **Open any webpage** (not chrome://)
2. **Open DevTools** (F12)
3. **Go to Console tab**
4. **Look for:** `[Content Script]` logs
5. If you don't see them, the content script isn't loading

## 6. Common Issues

### Issue: Popup opens but is blank
- **Check:** Console for JavaScript errors
- **Look for:** `[Popup] Component rendering` log
- **Fix:** Check for import errors or missing dependencies

### Issue: Popup doesn't open at all
- **Check:** Extension is enabled in `chrome://extensions/`
- **Check:** Extension icon appears in toolbar
- **Check:** No errors in extension service worker (if applicable)
- **Fix:** Reload the extension

### Issue: "Cannot extract content" error
- **Check:** You're on a regular webpage (not chrome:// or extension page)
- **Check:** Content script is loaded (see step 5)
- **Fix:** Refresh the page and try again

## 7. Debug Logs

All logs are prefixed with:
- `[Popup]` - Popup component logs
- `[Content Script]` - Content script logs
- `[Content Extraction]` - Content extraction logs
- `[API]` - API request/response logs
- `[Polling]` - Polling logs

If you see logs but the popup is blank, check the React component rendering.

