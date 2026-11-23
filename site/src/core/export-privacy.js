import { htmlToCleanText } from './serializers.js';

const emailPattern = /[\p{L}\p{N}.!#$%&'*+\/=?^_`{|}~-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const digitPattern = /(?<![\p{L}\p{N}])\+?\(?\d(?:[ \t().-]*\d){6,}(?![\p{L}\p{N}])/gu;

function isCardNumber(digits) {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index--) {
    const digit = Number(digits[index]);
    const doubled = (digits.length - 1 - index) % 2 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
}

function maskText(value) {
  return value.replace(emailPattern, '[REDACTED_EMAIL]').replace(digitPattern, (match) => {
    const digits = match.replace(/\D/g, '');
    if (isCardNumber(digits)) return '[REDACTED_CARD]';
    return digits.length >= 7 && digits.length <= 15 ? '[REDACTED_PHONE]' : match;
  });
}

function maskAttributes(value) {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map(maskAttributes);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      maskText(key),
      // Custom fields can contain phone or card numbers encoded as numbers.
      typeof item === 'number' && Number.isSafeInteger(item) && Math.abs(item) >= 1000000
        ? maskText(String(item))
        : maskAttributes(item)
    ]));
  }
  return value;
}

function maskHtml(value) {
  return maskText(htmlToCleanText(value))
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function maskConversation(conversation) {
  const masked = { ...conversation };
  for (const field of ['customerName', 'customerEmail', 'assignee', 'teamAssignee', 'ratingRemark']) {
    if (typeof masked[field] === 'string') masked[field] = maskText(masked[field]);
  }
  masked.title = maskHtml(masked.title);
  masked.companies = maskAttributes(masked.companies);
  masked.tags = maskAttributes(masked.tags);
  masked.customAttributes = maskAttributes(masked.customAttributes);
  masked.messages = (conversation.messages || []).map((message) => ({
    ...message,
    authorName: maskText(message.authorName || ''),
    authorEmail: maskText(message.authorEmail || ''),
    bodyHtml: maskHtml(message.bodyHtml),
    attachments: []
  }));
  return masked;
}

export function formatSkippedErrors(errors, masked) {
  return masked ? errors.map(({ status }) => ({ status })) : errors;
}
