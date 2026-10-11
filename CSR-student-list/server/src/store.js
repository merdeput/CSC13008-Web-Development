import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'students.json');
let writeQueue = Promise.resolve();

export async function readStudents() {
  const content = await readFile(file, 'utf8');
  const students = JSON.parse(content);
  if (!Array.isArray(students)) throw new Error('Student data must be an array.');
  return students;
}

export function writeStudents(students) {
  const save = writeQueue.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(students, null, 2)}\n`, 'utf8');
    await rename(temporary, file);
  });
  writeQueue = save.catch(() => {});
  return save;
}
