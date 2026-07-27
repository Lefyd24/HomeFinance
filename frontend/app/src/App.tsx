import { Wallet } from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center gap-2">
      <Wallet className="text-primary" size={28} />
      <span className="text-xl font-bold text-base-content">Home Finance</span>
    </div>
  )
}

export default App
