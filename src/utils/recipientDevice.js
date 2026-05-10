export const normalizePhoneDigits = (value) => String(value || '').replace(/\D+/g, '');

export const resolveLocalRecipientDevice = ({ accounts, currentUser, currentDevice, phoneNumber }) => {
  const inputDigits = normalizePhoneDigits(phoneNumber);

  if (!inputDigits) {
    return null;
  }

  const searchableAccounts = Array.isArray(accounts) && accounts.length
    ? accounts
    : [currentUser].filter(Boolean);

  for (const account of searchableAccounts) {
    if (!Array.isArray(account?.devices)) {
      continue;
    }

    const device = account.devices.find((candidate) => {
      const deviceDigits = normalizePhoneDigits(candidate.phoneNumber);
      return deviceDigits && deviceDigits === inputDigits;
    });

    if (device) {
      return {
        userId: account.id,
        userName: account.name,
        deviceId: device.id,
        storage: device.storage,
        name: device.name,
        phoneNumber: device.phoneNumber,
        isCurrentDevice: String(account.id) === String(currentUser?.id || '')
          && String(device.id) === String(currentDevice?.id || ''),
      };
    }
  }

  return null;
};
