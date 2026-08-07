export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatISOToFriendly(isoString: string): string {
  try {
    const dateObj = new Date(isoString);
    return dateObj.toLocaleString();
  } catch (e) {
    return isoString;
  }
}
