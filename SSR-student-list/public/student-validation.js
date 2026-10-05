(() => {
  const fieldsToValidate = new Set(['id', 'name', 'email', 'dob', 'major']);

  function readList(form, datasetKey) {
    try {
      const values = JSON.parse(form.dataset[datasetKey] || '[]');
      return Array.isArray(values) ? values.map((value) => String(value).trim()) : [];
    } catch {
      return [];
    }
  }

  function clientMessage(message) {
    return message ? `CLIENT: ${message}` : '';
  }

  function validateField(input, form) {
    const value = input.value.trim();

    switch (input.name) {
      case 'id': {
        if (!value) return clientMessage('Student ID is required.');
        if (!/^[A-Za-z0-9-]+$/.test(value)) return clientMessage('Use only letters, numbers, and hyphens.');
        if (readList(form, 'existingIds').includes(value)) return clientMessage('This student ID already exists.');
        return '';
      }
      case 'name':
        if (!value) return clientMessage('Name is required.');
        if (value.length < 2) return clientMessage('Name must contain at least 2 characters.');
        return '';
      case 'email': {
        if (!value) return clientMessage('Email is required.');
        if (!/^\S+@\S+\.\S+$/.test(value)) return clientMessage('Enter a valid email address.');
        const currentEmail = (form.dataset.currentEmail || '').trim().toLowerCase();
        const duplicate = readList(form, 'existingEmails').some((email) => email.toLowerCase() === value.toLowerCase());
        if (duplicate && value.toLowerCase() !== currentEmail) return clientMessage('This email is already registered.');
        return '';
      }
      case 'dob': {
        if (!value) return clientMessage('Date of birth is required.');
        const date = new Date(value);
        if (Number.isNaN(date.getTime()) || date > new Date()) return clientMessage('Enter a valid date in the past.');
        return '';
      }
      case 'major':
        return value ? '' : clientMessage('Major is required.');
      default:
        return '';
    }
  }

  function displayError(input, message) {
    const wrapper = input.closest('.mb-3, .mb-4') || input.parentElement;
    let feedback = wrapper.querySelector('.invalid-feedback');

    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'invalid-feedback';
      input.insertAdjacentElement('afterend', feedback);
    }

    feedback.textContent = message;
    feedback.hidden = !message;
    input.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  document.querySelectorAll('[data-student-validation]').forEach((form) => {
    const fields = [...form.querySelectorAll('input[name], select[name], textarea[name]')]
      .filter((input) => fieldsToValidate.has(input.name));

    fields.forEach((input) => {
      input.addEventListener('blur', () => {
        input.dataset.visited = 'true';
        displayError(input, validateField(input, form));
      });

      input.addEventListener('input', () => {
        if (input.dataset.visited === 'true' || input.classList.contains('is-invalid')) {
          displayError(input, validateField(input, form));
        }
      });
    });

    form.addEventListener('submit', (event) => {
      let firstInvalidField = null;

      fields.forEach((input) => {
        input.dataset.visited = 'true';
        const message = validateField(input, form);
        displayError(input, message);
        if (message && !firstInvalidField) firstInvalidField = input;
      });

      if (firstInvalidField) {
        event.preventDefault();
        firstInvalidField.focus();
      }
    });
  });
})();
