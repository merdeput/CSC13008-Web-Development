import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'students.json');

export async function readStudents() {
  const content = await readFile(file, 'utf8');
  const students = JSON.parse(content);
  if (!Array.isArray(students)) throw new Error('Student data must be an array.');
  return students;
}

export async function writeStudents(students) {
  await writeFile(file, `${JSON.stringify(students, null, 2)}\n`, 'utf8');
}
