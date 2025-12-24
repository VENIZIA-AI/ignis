export function getExpiryTime(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function getExpiryTimeInHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
