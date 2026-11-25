/*
 * Inline form checks shared by the sign-in page and the app.
 * Each check returns an error message, or '' when the value is fine.
 * The server runs the same rules (app.py: is_valid_email, validate_nepali_phone).
 */
(function () {
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  const PHONE_PREFIX_RE = /^(?:\(\+977\)\s*|\+977[\s-]?)/;

  function email(value) {
    const v = (value || '').trim();
    if (!v) return 'Enter your email address.';
    if (v.length > 254 || !EMAIL_RE.test(v)) return 'Enter a valid email address, like name@gmail.com.';
    return '';
  }

  function phone(value) {
    const v = (value || '').trim();
    if (!v) return 'Enter your phone number.';
    const digits = v.replace(PHONE_PREFIX_RE, '');
    if (!/^[0-9]+$/.test(digits)) return 'Use numbers only, like 9848262163.';
    if (digits.length !== 10) {
      return `Phone numbers have 10 digits. This one has ${digits.length}.`;
    }
    return '';
  }

  // The message sits right under the field (or under its wrapper)
  function messageEl(input) {
    const id = `${input.id}-error`;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('small');
      el.id = id;
      el.className = 'field-error';
      el.setAttribute('role', 'alert');
      const anchor = input.closest('.dob-picker-wrapper, .phone-input-wrap') || input;
      anchor.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function show(input, message) {
    if (!input) return;
    const el = messageEl(input);
    el.textContent = message || '';
    el.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', el.id);
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function check(input, fn) {
    const message = fn(input.value);
    show(input, message);
    return message;
  }

  // Checks when the person leaves the field, then live while they fix it
  function attach(input, fn) {
    if (!input || input.dataset.checksAttached) return;
    input.dataset.checksAttached = '1';
    input.addEventListener('blur', () => {
      if (input.value.trim()) check(input, fn);
    });
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') check(input, fn);
    });
  }

  // Runs every check; focuses the first field that needs fixing.
  // Returns true when everything is fine.
  function runAll(pairs) {
    let first = null;
    pairs.forEach(([input, fn]) => {
      if (!input) return;
      if (check(input, fn) && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  function clear(inputs) {
    inputs.forEach((input) => input && show(input, ''));
  }

  window.FieldChecks = { email, phone, attach, runAll, show, clear };
})();
