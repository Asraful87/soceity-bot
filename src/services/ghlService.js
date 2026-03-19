const axios = require('axios');
const { upsertMember, getMemberByEmail, getAllVerifiedMembers } = require('../database/db');
const { assignMemberRole, removeMemberRole } = require('./roleService');

const GHL_BASE_URL = 'https://rest.gohighlevel.com/v1';

const ghlClient = axios.create({
  baseURL: GHL_BASE_URL,
  headers: {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Look up a GHL contact by email address.
 * Returns the first matching contact or null.
 */
async function lookupContactByEmail(email) {
  try {
    const response = await ghlClient.get('/contacts/', {
      params: { email, locationId: process.env.GHL_LOCATION_ID },
    });
    const contacts = response.data?.contacts;
    if (!contacts || contacts.length === 0) return null;
    return contacts[0];
  } catch (err) {
    if (err.response?.status === 404) return null;
    console.error('GHL lookupContactByEmail error:', err.message);
    throw err;
  }
}

/**
 * Fetch a single GHL contact by their contact ID.
 */
async function getContactById(contactId) {
  try {
    const response = await ghlClient.get(`/contacts/${contactId}`);
    return response.data?.contact || null;
  } catch (err) {
    if (err.response?.status === 404) return null;
    console.error('GHL getContactById error:', err.message);
    throw err;
  }
}

/**
 * Handle incoming GHL webhook payload.
 * Supports: contact.updated, subscription.renewed, subscription.cancelled
 */
async function handleGHLWebhook(payload) {
  const { type, contact, contactId } = payload;

  console.log(`GHL webhook received: type=${type}`);

  const id = contactId || contact?.id;
  if (!id) {
    console.warn('GHL webhook missing contact ID, skipping.');
    return;
  }

  if (type === 'subscription.renewed' || type === 'contact.updated') {
    const freshContact = await getContactById(id);
    if (!freshContact) return;

    const isActive = freshContact.tags?.includes(process.env.GHL_ACTIVE_TAG) ||
                     freshContact.customField?.membershipStatus === 'active';

    const dbMember = await getMemberByEmail(freshContact.email);
    if (!dbMember) return;

    await upsertMember({
      ...dbMember,
      membershipExpiry: freshContact.membershipExpiry || null,
      verified: isActive ? 1 : 0,
    });

    console.log(`Updated member ${dbMember.discordId} from GHL webhook.`);
  }

  if (type === 'subscription.cancelled' || type === 'contact.deactivated') {
    const dbMember = await getMemberByEmail(contact?.email);
    if (!dbMember) return;

    await upsertMember({ ...dbMember, verified: 0 });
    console.log(`Deactivated member ${dbMember.discordId} from GHL webhook.`);
  }
}

module.exports = {
  lookupContactByEmail,
  getContactById,
  handleGHLWebhook,
};
