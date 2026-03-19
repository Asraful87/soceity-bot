# Membership Maintenance System

## Overview

The Membership Maintenance System is a fully implemented but **disabled-by-default** feature that automatically manages membership access based on GHL (GoHighLevel) payment status and renewal dates.

### What It Does

✅ **Active Status Preservation**: Keeps verified members active as long as their subscription is paid  
❌ **Automatic Role Revocation**: Removes member roles from users whose subscriptions have expired  
🔄 **Renewal Detection**: Automatically restores roles when expired members pay their renewal  
⏰ **Expiry Warnings**: Sends DMs to members with upcoming expiration dates (3 days before expiry)  







---

## Architecture

### Components

1. **Renewal Service** (`src/services/renewalService.js`)
   - Daily scheduler running at **08:00 UTC**
   - Checks all verified members for renewal status
   - Handles role revocation and restoration
   - Sends warning DMs

2. **Role Service** (`src/services/roleService.js`)
   - `assignMemberRole(member, contact)` - Assigns verified role to member
   - `removeMemberRole(member, reason)` - Removes member role with audit trail

3. **GHL Service** (`src/services/ghlService.js`)
   - `getContactById(contactId)` - Fetches fresh contact from GHL
   - `handleGHLWebhook()` - Processes real-time webhook events
   - Detects active vs inactive memberships

4. **Webhook Server** (`src/server.js`)
   - Express server for receiving GHL webhooks
   - Validates webhook signature
   - Routes events to GHL service handler

---

## Configuration

### Required Environment Variables

#### GHL Configuration
```env
# Get your API key from GHL dashboard > Settings > API
GHL_API_KEY=your_ghl_api_key_here

# Find this at the bottom of any GHL URL when in your location
GHL_LOCATION_ID=your_ghl_location_id_here

# Tag name for active members in GHL (customize in your GHL contacts)
GHL_ACTIVE_TAG=active
```

#### Webhook Configuration
```env
# Port for webhook server (default: 3000)
PORT=3000

# Secret key for webhook validation (set this in GHL webhook settings too)
WEBHOOK_SECRET=your_webhook_secret_here
```

#### Feature Flags (DISABLED BY DEFAULT)
```env
# Enable the daily membership renewal checker
# ⚠️  Only set to 'true' when you're ready to activate
MEMBERSHIP_MAINTENANCE_ENABLED=false

# Enable the webhook server for real-time GHL events
# ⚠️  Only set to 'true' when you're ready to activate
WEBHOOK_SERVER_ENABLED=false
```

---

## How to Activate

### Step 1: Configure GHL Credentials

Edit `.env` and fill in your GHL details:

```env
GHL_API_KEY=xxxxxxxxxxxxx
GHL_LOCATION_ID=xxxxxxxxxxxxx
GHL_ACTIVE_TAG=active
WEBHOOK_SECRET=your_secure_webhook_secret_here
```

**To get GHL API Key:**
1. Go to GHL Dashboard
2. Settings → API
3. Create/Copy your API key

**To get GHL Location ID:**
1. Any GHL page URL contains your Location ID
2. Usually looks like: `https://gohighlevel.com/#/location/location_xxxxx`

### Step 2: Set Feature Flags

When you're ready to activate, change the feature flags in `.env`:

```env
# Activate the daily renewal checker
MEMBERSHIP_MAINTENANCE_ENABLED=true

# Activate the webhook server for real-time events
WEBHOOK_SERVER_ENABLED=true
```

### Step 3: Restart Bot

Restart the bot for changes to take effect:

```bash
npm start
```

You'll see log messages indicating activation:
```
[RenewalChecker] ✅ Activated — runs daily at 08:00 UTC.
[WebhookServer] ✅ Listening on port 3000 for GHL webhooks.
```

### Step 4: Configure GHL Webhooks (Optional but Recommended)

Set up webhooks in GHL to sync real-time payment events:

1. **Go to GHL**: Settings → Webhooks
2. **Add Webhook URL**: `https://yourdomain.com:3000/webhook/ghl`
3. **Add Secret**: Same as `WEBHOOK_SECRET` in `.env`
4. **Select Events**:
   - `contact.updated` - When contact status changes
   - `subscription.renewed` - When member pays renewal
   - `subscription.cancelled` - When member subscription cancelled

---

## System Behavior

### Daily Renewal Check (Default: 08:00 UTC)

When enabled, every day at 08:00 UTC:

1. **Fetch all verified members** from database
2. **For each member**:
   - Check if `renewal_date` has passed
   - If **expired**:
     - Query GHL for fresh payment status
     - If **renewed** → Restore member role + send confirmation DM
     - If **unpaid** → Remove member role + send expiry notice + unverify
   - If **expiring soon** (≤ 3 days) → Send warning DM

### Real-Time Webhook Events (Optional)

When `WEBHOOK_SERVER_ENABLED=true`:

- **`subscription.renewed`** → Check GHL, restore member role if conditions met
- **`subscription.cancelled`** → Unverify member, remove role
- **`contact.updated`** → Sync active status with Discord

---

## Testing Without Full Activation

You can test partially without activating both systems:

### Test Renewal Checker Only
- Set `MEMBERSHIP_MAINTENANCE_ENABLED=true`
- Set `WEBHOOK_SERVER_ENABLED=false`
- Bot will check renewals daily but won't listen for real-time updates

### Test Webhook Server Only
- Set `MEMBERSHIP_MAINTENANCE_ENABLED=false`
- Set `WEBHOOK_SERVER_ENABLED=true`
- Webhook server listens for GHL events but won't run daily checks

### Monitor Log Output
Check console for logs from both systems:
```
[RenewalChecker] → Daily check entries
[WebhookServer]  → Incoming webhook entries
[RoleService]    → Role assignment/removal entries
```

---

## Database Schema

The system uses these fields in the `members` table:

| Field | Type | Purpose |
|-------|------|---------|
| `discord_id` | TEXT PRIMARY KEY | Discord user ID |
| `email` | TEXT | User's email (lookup key) |
| `verified` | INTEGER (0/1) | Is user currently verified? |
| `renewal_date` | TEXT (ISO 8601) | When membership expires |
| `ghl_contact_id` | TEXT | GHL contact ID for API lookups |

### Renewal Date Format
- Stored as ISO 8601 timestamp: `2025-12-31T23:59:59Z`
- Checked daily against current date
- Retrieved from GHL `membershipExpiry` field

---

## Safety Features

✅ **Deactivated by Default**: Both systems require explicit `=true` to activate  
✅ **Non-Fatal Failures**: Role changes are graceful; failures don't crash bot  
✅ **Audit Trail**: All role changes are logged with reasons  
✅ **Webhook Validation**: Webhooks require secret signature match  
✅ **Graceful Degradation**: Missing GHL credentials won't break Discord functionality

---

## Troubleshooting

### System Not Activating
Check logs on startup. If you see:
```
[RenewalChecker] ⚠️  Membership maintenance is DISABLED.
```
Then `MEMBERSHIP_MAINTENANCE_ENABLED=false` in your `.env`

### Role Changes Not Working
1. Verify bot has `Manage Roles` permission in guild
2. Verify `VERIFIED_ROLE_ID` in `.env` is valid
3. Check role hierarchy: bot role must be higher than member roles
4. Check logs for error messages

### GHL API Errors
1. Verify `GHL_API_KEY` is valid (not expired)
2. Verify `GHL_LOCATION_ID` is correct
3. Check GHL dashboard for rate limits
4. Verify firewall isn't blocking outbound HTTPS to `rest.gohighlevel.com`

### Webhooks Not Received
1. Ensure `WEBHOOK_SERVER_ENABLED=true`
2. Verify firewall opens port 3000 (or your `PORT` setting)
3. Check webhook URL is publicly accessible
4. Check webhook credentials match `WEBHOOK_SECRET`
5. Look for log entry: `[WebhookServer] Listening on port 3000`

---

## Disabling

To disable the system:

```env
# Disable renewal checker
MEMBERSHIP_MAINTENANCE_ENABLED=false

# Disable webhook server
WEBHOOK_SERVER_ENABLED=false
```

Restart the bot. The system will log that it's disabled but continue running other features normally.

---

## Manual Testing

### Test Role Assignment
```bash
/verify <user_email>
```
This verifies a member and tests role assignment.

### Check Status
Look at database:
```sql
SELECT discord_id, email, verified, renewal_date FROM members;
```

### Manual Role Removal (if needed)
Direct Discord: Remove the member role manually (this is not automated unless renewal system is enabled).

---

## Future Enhancements

- [ ] Configurable renewal check time
- [ ] Partial role restoration (tier-based memberships)
- [ ] Email notifications to GHL contacts
- [ ] Renewal override commands
- [ ] Dashboard showing renewal status
- [ ] Failed renewal recovery workflows

---

## Support

For issues or questions:
1. Check logs: `[RenewalChecker]`, `[WebhookServer]`, `[RoleService]`
2. Verify all config variables are set
3. Ensure bot has required Discord permissions
4. Test GHL API connectivity separately

---

**Last Updated**: March 2026  
**Status**: Fully Implemented, Disabled by Default
