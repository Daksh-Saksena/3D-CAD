import Canvas from './components/Canvas'
import Controls from './components/Controls'
import AiInput from './components/AiInput'
import Toolbar from './components/Toolbar'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <Canvas />
      <Controls />
      <Toolbar />
      <AiInput />
    </div>
  )
}

export default App
