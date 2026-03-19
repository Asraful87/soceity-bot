# ✅ Membership Maintenance System - Installation Complete

## Status: FULLY IMPLEMENTED & DEACTIVATED (Ready to Activate)

Your bot now has a complete membership maintenance system that will:
- ✅ Check membership renewal status daily (08:00 UTC)
- ✅ Revoke roles from unpaid members
- ✅ Restore roles for members who renew payment
- ✅ Send expiry warnings 3 days before expiration
- ✅ Handle real-time GHL webhook events (optional)

**Current Status**: All features implemented but **DISABLED BY DEFAULT** for safety.

---

## What Was Implemented

### 1. **GHL Role Management** ✅
- `assignMemberRole(member, contact)` - Assigns VERIFIED_ROLE_ID
- `removeMemberRole(member, reason)` - Removes membership role with audit logging
- Location: `src/services/roleService.js`

### 2. **Renewal Service** ✅
- Daily scheduler (08:00 UTC)
- Checks all verified members for renewal dates
- Detects expired vs active memberships
- Fetches fresh GHL contact data to check for renewal payments
- Auto-restores roles if member has paid
- Sends warning DMs 3 days before expiry
- Location: `src/services/renewalService.js`

### 3. **Webhook Server Integration** ✅
- Express server for real-time GHL events
- Supports `subscription.renewed`, `subscription.cancelled`, `contact.updated` events
- Webhook validation with secret signatures
- Location: `src/server.js`

### 4. **Bot Integration** ✅
- Renewal checker starts automatically when bot loads (if enabled)
- Webhook server starts simultaneously (if enabled)
- Both systems report their activation status in console logs
- Location: `src/bot.js`

### 5. **Configuration Files** ✅
- `.env` updated with all required GHL credentials
- Feature flags set to `false` (deactivated)
- Documentation file created: `MEMBERSHIP_MAINTENANCE_SYSTEM.md`
- Location: `d:\Soceity Bot\discord-ghl-verification-bot\.env`

---

## How to Activate

### Step 1: Get GHL Credentials
You need 3 things from your GHL account:

```env
# 1. API Key
GHL_API_KEY=your_api_key_from_ghl_dashboard

# 2. Location ID  
GHL_LOCATION_ID=your_location_id_from_url

# 3. Tag name for active members
GHL_ACTIVE_TAG=active
```

### Step 2: Update `.env`

Edit `d:\Soceity Bot\discord-ghl-verification-bot\.env` and change:

**FROM:**
```env
MEMBERSHIP_MAINTENANCE_ENABLED=false
WEBHOOK_SERVER_ENABLED=false
```

**TO:**
```env
MEMBERSHIP_MAINTENANCE_ENABLED=true
WEBHOOK_SERVER_ENABLED=true
```

(Or activate just the renewal checker if you don't want real-time webhooks)

### Step 3: Restart Bot

Stop and restart your bot. You'll see activation logs:

```
[RenewalChecker] ✅ Activated — runs daily at 08:00 UTC.
[WebhookServer] ✅ Listening on port 3000 for GHL webhooks.
```

---

## System Behavior

### Daily Check (08:00 UTC)
1. Queries all verified members from database
2. For each member:
   - Checks if `renewal_date` has passed
   - Fetches fresh contact from GHL API
   - If member renewed → **Restores role** ✅ + sends "Payment Received" DM
   - If member didn't renew → **Removes role** ❌ + sends "Membership Expired" DM
   - If expiring soon → Sends "Renew Soon" warning DM

### Real-Time Webhooks (Optional)
When `WEBHOOK_SERVER_ENABLED=true`:
- Listens on port 3000 for GHL events
- Instantly syncs GHL membership status with Discord roles
- No need to wait for daily 08:00 UTC check

---

## Feature Flag Options

You can activate systems independently:

| Config | Daily Checker | Webhooks | Best For |
|--------|---------------|----------|----------|
| Both `false` | ❌ | ❌ | Safe testing, development |
| `MAINTENANCE` `true` | ✅ | ❌ | Scheduled-only checks |
| `WEBHOOK` `true` | ❌ | ✅ | Real-time only (advanced) |
| Both `true` | ✅ | ✅ | Full system (recommended) |

---

## Safety Features

✅ **Deactivated by Default** - Must explicitly enable in `.env`  
✅ **Feature Flags** - Can enable/disable independently  
✅ **Non-Fatal Errors** - Failures don't crash the bot  
✅ **Audit Logging** - All role actions logged with reasons  
✅ **Graceful Degradation** - Missing credentials won't break Discord  
✅ **Webhook Validation** - Only accepts validated signatures  

---

## Current .env Status

✅ **GHL_API_KEY** → Placeholder (needs your credential)  
✅ **GHL_LOCATION_ID** → Placeholder (needs your credential)  
✅ **GHL_ACTIVE_TAG** → Set to `active`  
✅ **WEBHOOK_SECRET** → Placeholder (needs your credential)  
✅ **MEMBERSHIP_MAINTENANCE_ENABLED** → `false` (deactivated)  
✅ **WEBHOOK_SERVER_ENABLED** → `false` (deactivated)  

---

## Database Fields Used

The system uses these fields automatically populated during verification:

```sql
SELECT 
  discord_id,
  email, 
  verified,
  renewal_date,        -- When membership expires (ISO format)
  ghl_contact_id       -- GHL contact ID for API lookups
FROM members;
```

**Example Row:**
```
discord_id: 1481560042728718386
email: user@example.com
verified: 1
renewal_date: 2025-12-31T23:59:59Z
ghl_contact_id: abc123def456
```

---

## What Happens at Each UTC Time

### 08:00 UTC
- Renewal checker wakes up
- Queries database for all verified members
- Checks payment status in GHL
- Updates roles and sends DMs

### Any Time
- Member uses `/verify` command → Gets verified, renewal_date fetched from GHL
- Member pays in GHL → Can be auto-restored on next 08:00 check
- GHL webhook fires (if enabled) → Real-time role sync

---

## Commands Still Working

These commands continue to work normally:
- `/verify <email>` - Manual membership verification
- `/sendpanel` - Send application panel
- Application review buttons (Approve/Deny/Interview)

**Note**: The renewal system works *alongside* these commands, not replaces them.

---

## Testing Checklist

Before going live, consider:
- [ ] GHL API key is valid and not expired
- [ ] GHL Location ID matches your location
- [ ] GHL tag name is correct (default: `active`)
- [ ] Bot has `Manage Roles` permission in guild
- [ ] VERIFIED_ROLE_ID is valid and accessible
- [ ] Test in safe environment with one test member first
- [ ] Monitor logs for errors during daily check
- [ ] Webhooks configured in GHL (if using them)

---

## Quick Reference: Activation Steps

1. Open `.env` file
2. Find: `MEMBERSHIP_MAINTENANCE_ENABLED=false`
3. Change to: `MEMBERSHIP_MAINTENANCE_ENABLED=true`
4. Find: `WEBHOOK_SERVER_ENABLED=false` (optional)
5. Change to: `WEBHOOK_SERVER_ENABLED=true` (optional)
6. Save file
7. Restart bot
8. Check logs for activation confirmation

---

## Documentation Files

📄 **MEMBERSHIP_MAINTENANCE_SYSTEM.md** - Full system documentation  
📄 **QUICK_START.md** - This quick reference (you are here)  
📄 **.env** - Configuration with feature flags  

---

## Heroku Deployment (Repo-in-Subfolder)

This project is inside a subfolder:

```
d:\Soceity Bot\discord-ghl-verification-bot
```

If you deploy from `d:\Soceity Bot` using the default Heroku Node buildpack, Heroku cannot detect `package.json` at repo root and build fails.

Use this command from `d:\Soceity Bot` so Heroku builds from the subfolder content:

```powershell
heroku git:remote -a YOUR_HEROKU_APP_NAME
git subtree push --prefix discord-ghl-verification-bot heroku main
```

### Required Heroku Config Vars

Set all required values in Heroku app config:

```powershell
heroku config:set DISCORD_TOKEN=your_token
heroku config:set CLIENT_ID=your_client_id
heroku config:set GUILD_ID=your_guild_id
heroku config:set VERIFIED_ROLE_ID=your_verified_role_id
heroku config:set MEMBERSHIP_MAINTENANCE_ENABLED=true
heroku config:set WEBHOOK_SERVER_ENABLED=true
```

You can add your GHL and Google credentials with the same `heroku config:set` pattern.

### Verify Deployment

After deploy:

```powershell
heroku ps
heroku logs --tail
```

You should see startup output from `node src/index.js`.

---

## Need Help?

Check the detailed documentation in `MEMBERSHIP_MAINTENANCE_SYSTEM.md` for:
- Troubleshooting guide
- GHL API credential setup
- Webhook configuration in GHL
- Database schema details
- Manual testing procedures
- Safety features explained

---

**Status**: ✅ Ready to Activate  
**Safety Level**: High (deactivated by default)  
**Complexity**: Medium (but handled automatically once enabled)  
**Last Updated**: March 2026

When you're ready to activate, just change those 2 feature flags to `true` and restart! 🚀
