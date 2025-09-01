function App() {
  return (
    <div style={{
      backgroundColor: 'red',
      color: 'white',
      fontSize: '24px',
      padding: '50px',
      minHeight: '100vh'
    }}>
      <h1>🔧 TEST REACT MINIMO v2</h1>
      <p>Se vedi questo testo, React funziona!</p>
      <button style={{
        backgroundColor: 'blue',
        color: 'white',
        padding: '10px 20px',
        border: 'none',
        borderRadius: '5px',
        fontSize: '16px',
        cursor: 'pointer'
      }}>
        Clicca qui per testare
      </button>
    </div>
  );
}

export default App;
