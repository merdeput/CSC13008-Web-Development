const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const studentsFile = path.join(__dirname, 'data', 'student.json');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function readStudents() {
  try {
    const data = fs.readFileSync(studentsFile, 'utf8');
    const students = JSON.parse(data);
    return Array.isArray(students)
      ? students.map((student) => ({ ...student, id: String(student.id) }))
      : [];
  } catch (error) {
    console.error('Could not read student data:', error.message);
    return [];
  }
}

function writeStudents(students) {
  fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2));
}

function validateStudent(input, students, currentId = null) {
  const errors = {};
  const student = {
    id: input.id?.trim(),
    name: input.name?.trim(),
    email: input.email?.trim().toLowerCase(),
    dob: input.dob?.trim(),
    major: input.major?.trim()
  };

  if (!student.id) errors.id = 'Student ID is required.';
  else if (!/^[A-Za-z0-9-]+$/.test(student.id)) errors.id = 'Use only letters, numbers, and hyphens.';
  else if (students.some((item) => item.id === student.id && item.id !== currentId)) errors.id = 'This student ID already exists.';

  if (!student.name) errors.name = 'Name is required.';
  else if (student.name.length < 2) errors.name = 'Name must contain at least 2 characters.';

  if (!student.email) errors.email = 'Email is required.';
  else if (!/^\S+@\S+\.\S+$/.test(student.email)) errors.email = 'Enter a valid email address.';
  else if (students.some((item) => item.email === student.email && item.id !== currentId)) errors.email = 'This email is already registered.';

  if (!student.dob) errors.dob = 'Date of birth is required.';
  else if (Number.isNaN(Date.parse(student.dob)) || new Date(student.dob) > new Date()) errors.dob = 'Enter a valid date in the past.';

  if (!student.major) errors.major = 'Major is required.';

  return { student, errors };
}

const sortableStudentFields = ['id', 'name', 'email', 'dob', 'major'];

function getStudentListState(students, query = {}) {
  const majors = [...new Set(students.map((student) => student.major).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const sortBy = sortableStudentFields.includes(query.sortBy) ? query.sortBy : 'id';
  const sortDirection = query.sortDirection === 'desc' ? 'desc' : 'asc';
  const selectedMajor = majors.includes(query.major) ? query.major : '';
  const visibleStudents = students
    .filter((student) => !selectedMajor || student.major === selectedMajor)
    .sort((a, b) => {
      const result = String(a[sortBy] ?? '').localeCompare(String(b[sortBy] ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      });
      return sortDirection === 'asc' ? result : -result;
    });

  return { students: visibleStudents, totalCount: students.length, majors, sortBy, sortDirection, selectedMajor };
}

function renderStudentList(res, students, options = {}) {
  const { formData = {}, errors = {}, success = false, createModalOpen = false, query = {} } = options;
  res.render('students', {
    ...getStudentListState(students, query),
    formData,
    errors,
    success,
    createModalOpen
  });
}

app.get('/', (req, res) => res.render('home'));

app.get('/students', (req, res) => {
  renderStudentList(res, readStudents(), { query: req.query });
});

app.get('/students/:id', (req, res) => {
  const student = readStudents().find((item) => item.id === req.params.id);
  if (!student) return res.status(404).send('Student not found.');
  res.render('student-detail', { student });
});

app.get('/students/:id/edit', (req, res) => {
  const student = readStudents().find((item) => item.id === req.params.id);
  if (!student) return res.status(404).send('Student not found.');
  res.render('student-edit', { student, formData: student, errors: {} });
});

app.post('/students', (req, res) => {
  const students = readStudents();
  const { student, errors } = validateStudent(req.body, students);

  if (Object.keys(errors).length) {
    res.status(422);
    return renderStudentList(res, students, {
      formData: student, errors, createModalOpen: true, query: req.body
    });
  }

  students.push(student);
  try {
    writeStudents(students);
    return renderStudentList(res, students, { success: true, query: req.body });
  } catch (error) {
    console.error('Could not save student:', error.message);
    res.status(500);
    return renderStudentList(res, students, {
      formData: student,
      errors: { form: 'Unable to save this student. Please try again.' },
      createModalOpen: true,
      query: req.body
    });
  }
});

app.post('/students/:id', (req, res) => {
  const students = readStudents();
  const index = students.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).send('Student not found.');

  const { student, errors } = validateStudent({ ...req.body, id: req.params.id }, students, req.params.id);
  if (Object.keys(errors).length) {
    return res.status(422).render('student-edit', { student: students[index], formData: student, errors });
  }

  students[index] = student;
  try {
    writeStudents(students);
    res.redirect(`/students/${encodeURIComponent(student.id)}`);
  } catch (error) {
    console.error('Could not update student:', error.message);
    return res.status(500).render('student-edit', {
      student: students[index], formData: student, errors: { form: 'Unable to save these changes. Please try again.' }
    });
  }
});

app.post('/students/:id/delete', (req, res) => {
  const students = readStudents();
  const remaining = students.filter((item) => item.id !== req.params.id);
  if (remaining.length === students.length) return res.status(404).send('Student not found.');

  try {
    writeStudents(remaining);
    res.redirect('/students');
  } catch (error) {
    console.error('Could not delete student:', error.message);
    res.status(500).send('Unable to delete student.');
  }
});

app.listen(port, () => console.log(`Student list running at http://localhost:${port}`));
