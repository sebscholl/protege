/**
 * Returns true when value is a syntactically valid email address.
 */
export function isValidEmailAddress(
  args: {
    value: string;
    allowLocalhost?: boolean;
  },
): boolean {
  const pattern = args.allowLocalhost === false
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    : /^[^\s@]+@(?:localhost|[^\s@]+\.[^\s@]+)$/;
  return pattern.test(args.value);
}

/**
 * Reads domain text from one email address string.
 */
export function readEmailAddressDomain(
  args: {
    emailAddress: string;
  },
): string {
  const atIndex = args.emailAddress.lastIndexOf('@');
  if (atIndex < 0 || atIndex === args.emailAddress.length - 1) {
    return '';
  }

  return args.emailAddress.slice(atIndex + 1).toLowerCase();
}
