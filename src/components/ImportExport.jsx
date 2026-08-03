import { useRef, useState } from 'react';
import { validateFamilyData } from '../utils/familyUtils';
import '../styles/ImportExport.css';

export default function ImportExport({ exportData, onImport }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'family.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setError('');
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch {
        setError('That file is not valid JSON.');
        return;
      }
      const { valid, error: validationError } = validateFamilyData(parsed);
      if (!valid) {
        setError(validationError);
        return;
      }
      if (!window.confirm('Import this file? It will replace the current family tree.')) return;
      onImport(parsed);
      setError('');
    };
    reader.readAsText(file);
  };

  return (
    <div className="import-export">
      <button type="button" onClick={handleExport} title="Download family data as JSON">
        Export
      </button>
      <button type="button" onClick={handleImportClick} title="Replace family data from a JSON file">
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {error && <span className="import-export-error" title={error}>{error}</span>}
    </div>
  );
}
