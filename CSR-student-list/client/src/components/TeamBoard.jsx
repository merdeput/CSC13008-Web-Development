import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

const palettes = ['coral', 'violet', 'blue', 'mint', 'amber'];

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

export default function TeamBoard({ teams, students, locked, swapping, animating, outdated, shuffleNames, onMove, onLock, onSwap }) {
  const byId = new Map(students.map((student) => [student.id, student]));
  return <LayoutGroup>
    <div className={`team-grid ${animating ? 'is-dealing' : ''}`}>
      {teams.map((team, index) => <motion.article layout key={index} className={`team-card team-${palettes[index % palettes.length]} ${!animating && !outdated ? 'team-complete' : ''}`} style={{ '--deal-delay': `${Math.min(index * 75, 375)}ms` }}>
        <header><span className="team-color-dot"/><h3>Team {String(index + 1).padStart(2, '0')}</h3><span className="member-count">{team.length} {team.length === 1 ? 'member' : 'members'}</span></header>
        <div className="team-members" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/student-id'); if (id) onMove(id, index, event.target.closest('.member-card')?.dataset.studentId); }}>
          <AnimatePresence mode="popLayout">
            {team.map((id) => {
              const student = byId.get(id);
              if (!student) return null;
              const isLocked = locked.has(id);
              const shownName = animating ? shuffleNames[id] || student.name : student.name;
              return <motion.article layoutId={`member-${id}`} layout initial={{ opacity: 0, scale: .9, y: 9 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .92 }} transition={{ type: 'spring', stiffness: 430, damping: 34 }} className={`member-card ${isLocked ? 'is-locked' : ''} ${swapping === id ? 'is-selected' : ''} ${animating ? 'is-shuffling' : ''}`} key={id} data-student-id={id} draggable={!animating && !isLocked} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/student-id', id); event.currentTarget.classList.add('is-dragging'); }} onDragEnd={(event) => event.currentTarget.classList.remove('is-dragging')}>
                <span className={`table-avatar ${palettes[student.name.charCodeAt(0) % palettes.length]}`}>{initials(student.name)}</span>
                <span className="member-info"><AnimatePresence mode="popLayout"><motion.b key={shownName} initial={{ opacity: 0, y: 7, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -7, filter: 'blur(3px)' }} transition={{ duration: .11 }}>{shownName}</motion.b></AnimatePresence><small>{student.major}</small></span>
                <div className="member-actions"><button className={isLocked ? 'icon-action lock-active' : 'icon-action'} aria-label={`${isLocked ? 'Unlock' : 'Lock'} ${student.name} in this team`} title={isLocked ? 'Unlock student' : 'Keep student in this team'} disabled={animating || Boolean(swapping)} onClick={() => onLock(id)}>{isLocked ? '◆' : '◇'}</button><button className={swapping === id ? 'icon-action swap-active' : 'icon-action'} aria-label={`Choose ${student.name} for a swap`} title={isLocked ? 'Unlock before swapping' : swapping ? `Swap with ${student.name}` : 'Select to swap teams'} disabled={animating || isLocked} onClick={() => onSwap(id)}>{swapping === id ? '✓' : '⇄'}</button></div>
              </motion.article>;
            })}
          </AnimatePresence>
          {team.length === 0 && <p className="empty-team">No unlocked students assigned. Drop a student here.</p>}
        </div>
      </motion.article>)}
    </div>
  </LayoutGroup>;
}
