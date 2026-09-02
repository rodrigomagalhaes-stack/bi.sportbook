import { useState } from 'react'
import EventTab from './components/EventTab'
import OverviewTab from './components/OverviewTab'
import { useEvents } from './hooks/useEvents'

export default function App() {
  const [tab, setTab] = useState('event')
  const { events, loading, connected, saveEvent, deleteEvent, fetchEntries, fetchAllUserEvents, updateEventPrizeModel, renameEvent, setEventPago, setEventSemVencedor } = useEvents()
  const [highlightId, setHighlightId] = useState(null)

  function handleSelectFromOverview(id) {
    setHighlightId(id)
    setTab('event')
  }

  return (
    <div className="app">
      {/* Antes eram duas faixas empilhadas: uma com a marca (que saiu, porque
          quem nomeia a tela agora é o topo do portal) e outra com as abas.
          Sozinhas ficavam quase vazias e comiam altura à toa, então viraram
          uma barra só: abas à esquerda, estado da conexão à direita. */}
      <div className="app-toolbar">
        <nav className="tabs">
          <button className={`tab-btn${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>
            Visão Geral
          </button>
          <button className={`tab-btn${tab === 'event' ? ' active' : ''}`} onClick={() => setTab('event')}>
            Por Evento
          </button>
        </nav>

        <div className="header-right">
          <span className="status-local">
            <span className="dot" style={{ background: 'var(--pb-linha-2)' }} />
            Local
          </span>
          <button className="btn-banco">
            <span>⚙</span> Banco
            <span className="dot" style={{ background: connected ? 'var(--pb-verde)' : 'var(--pb-linha-2)', marginLeft: 6 }} />
          </button>
        </div>
      </div>

      {loading && <div className="loading-bar" />}

      {tab === 'event' && (
        <EventTab
          events={events}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onFetchEntries={fetchEntries}
          onUpdatePrizeModel={updateEventPrizeModel}
          onRename={renameEvent}
          onSetPago={setEventPago}
          onSetSemVencedor={setEventSemVencedor}
          highlightId={highlightId}
          onClearHighlight={() => setHighlightId(null)}
        />
      )}
      {tab === 'overview' && (
        <OverviewTab
          events={events}
          onSelectEvent={handleSelectFromOverview}
          onFetchAllUserEvents={fetchAllUserEvents}
        />
      )}
    </div>
  )
}
