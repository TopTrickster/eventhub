// "Suggest with AI": one line of text in, a labelled suggestion for title, summary and
// category out. It fills the form; it never saves. It shows when it is working and when
// it fell back, and the form keeps working either way.
import { useState } from 'react';
import { api } from '../api.js';
import { Notice } from './StateViews.jsx';

export function AiDraftPanel({ onDraft }) {
  const [text, setText] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '' });

  async function suggest() {
    setState({ status: 'working', message: '' });
    try {
      const result = await api.eventDraft(text);
      onDraft(result.draft);
      setState(
        result.source === 'model'
          ? { status: 'model', message: 'Това е предложение от AI, не проверени данни. Прегледайте полетата преди запис.' }
          : { status: 'fallback', message: result.message },
      );
    } catch (error) {
      setState({ status: 'error', message: `${error.message} Можете да попълните полетата ръчно.` });
    }
  }

  const working = state.status === 'working';
  return (
    <section className="card ai-panel" aria-labelledby="ai-heading">
      <h2 id="ai-heading">Чернова с AI</h2>
      <p className="field-hint" id="ai-privacy">
        Текстът по-долу се изпраща към външен AI доставчик (Google). Не въвеждайте лични данни. Датите, мястото и
        броя места попълвате сами.
      </p>
      <div className="field">
        <label htmlFor="ai-text">Опишете събитието с едно изречение</label>
        <textarea
          id="ai-text"
          rows={2}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="ai-privacy"
          placeholder="Например: уъркшоп по React за начинаещи от клуба по програмиране"
        />
      </div>
      <button type="button" className="button button-secondary" onClick={suggest} disabled={working} aria-busy={working}>
        {working ? 'Генериране...' : 'Предложи с AI'}
      </button>
      {state.status === 'model' && <Notice kind="info">{state.message}</Notice>}
      {state.status === 'fallback' && <Notice kind="warning">{state.message}</Notice>}
      {state.status === 'error' && <Notice kind="error">{state.message}</Notice>}
    </section>
  );
}
