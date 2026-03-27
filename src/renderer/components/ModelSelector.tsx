import { api } from '../api-client'

interface Props {
  models: string[]
  selectedModel: string
  conversationId: number
  onModelChange: (model: string) => void
}

export function ModelSelector({ models, selectedModel, conversationId, onModelChange }: Props) {
  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newModel = e.target.value
    await api.updateConversationModel(conversationId, newModel)
    onModelChange(newModel)
  }

  return (
    <select value={selectedModel} onChange={handleChange} style={styles.select}>
      <option value="auto">Auto</option>
      {models.map(id => (
        <option key={id} value={id}>{id}</option>
      ))}
    </select>
  )
}

const styles: Record<string, React.CSSProperties> = {
  select: {
    background: '#2c2c2e',
    color: '#e5e5ea',
    border: '1px solid #3a3a3c',
    borderRadius: 6,
    padding: '4px 8px',
    outline: 'none',
    fontSize: 13,
    cursor: 'pointer',
  },
}
