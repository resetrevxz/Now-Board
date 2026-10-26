import type { Action, BoardState } from '../state/types';
import { countWords } from '../state/normalize';
import { useToast } from './Toasts';
import { IconButton } from './ui';
import { Icon } from './Icon';

export function NotesPanel({
  state,
  dispatch,
}: {
  state: BoardState;
  dispatch: (action: Action) => void;
}) {
  const { notify } = useToast();
  const words = countWords(state.notes);

  const togglePrivacy = () => {
    dispatch({ type: 'notes/privacy', isPrivate: !state.notesPrivate });
    notify(
      state.notesPrivate
        ? 'Notes visible in Present mode.'
        : 'Notes hidden from Present mode.',
      { duration: 2400 },
    );
  };

  return (
    <section className="panel notes-panel" aria-label="Notes">
      <div className="panel__head">
        <span className="panel__title">
          <Icon name="pencil" size={14} />
          Notes
        </span>
        <div className="panel__actions">
          <IconButton
            label={state.notesPrivate ? 'Make notes visible in Present' : 'Hide notes from Present'}
            icon={state.notesPrivate ? 'eye-off' : 'eye'}
            size="sm"
            active={state.notesPrivate}
            onClick={togglePrivacy}
          />
        </div>
      </div>
      <div className="panel__body">
        <textarea
          className="notes-textarea"
          value={state.notes}
          maxLength={4000}
          placeholder="Loose thoughts, constraints, the one thing that matters…"
          aria-label="Notes"
          onChange={(event) => dispatch({ type: 'notes/set', text: event.target.value })}
        />
        <div className="notes-footer">
          <span className="notes-footer__label">
            {state.notesPrivate ? (
              <>
                <Icon name="lock" size={10} className="notes-private-badge" />
                <span className="notes-private-badge">Private — hidden in Present</span>
              </>
            ) : (
              <>
                <Icon name="eye" size={10} />
                Visible in Present
              </>
            )}
          </span>
          <span>{words} {words === 1 ? 'word' : 'words'}</span>
        </div>
      </div>
    </section>
  );
}
