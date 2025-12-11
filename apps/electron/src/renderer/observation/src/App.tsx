import ObservationModal from './components/ObservationModal';

function App() {
  // Get type from URL params
  const params = new URLSearchParams(window.location.search);
  const type = (params.get('type') as 'start' | 'end') || 'start';

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <ObservationModal type={type} />
    </div>
  );
}

export default App;

