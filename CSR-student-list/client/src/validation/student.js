const blank = { id: '', name: '', email: '', dob: '', major: '' };
export const emptyStudent = () => ({ ...blank });

function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function validateStudent(value, students, originalId = null) {
  const fields = {};
  const student = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' ? item.trim() : '']));
  student.email = student.email.toLowerCase();
  if (!student.id) fields.id = 'Student ID is required.';
  else if (!/^[A-Za-z0-9-]+$/.test(student.id)) fields.id = 'Use only letters, numbers, and hyphens.';
  else if (students.some((item) => item.id === student.id && item.id !== originalId)) fields.id = 'This student ID already exists.';
  if (!student.name) fields.name = 'Name is required.';
  else if (student.name.length < 2) fields.name = 'Name must contain at least 2 characters.';
  if (!student.email) fields.email = 'Email is required.';
  else if (!/^\S+@\S+\.\S+$/.test(student.email)) fields.email = 'Enter a valid email address.';
  else if (students.some((item) => item.email.toLowerCase() === student.email && item.id !== originalId)) fields.email = 'This email is already registered.';
  if (!student.dob) fields.dob = 'Date of birth is required.';
  else if (!isValidDateOnly(student.dob) || student.dob > localDateString()) fields.dob = 'Enter a valid date that is not in the future.';
  if (!student.major) fields.major = 'Major is required.';
  return { student, fields };
}
