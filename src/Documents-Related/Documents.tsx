import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './Documents.css';

interface DocumentSidebarProps {
  projectId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export const DocumentSidebar: React.FC<DocumentSidebarProps> = ({
  projectId,
  isOpen,
  onToggle,
}) => {
  const [docId, setDocId] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch document
  useEffect(() => {
    if (!projectId) return;

    const fetchDocument = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching doc:', error);
      } else if (data) {
        setDocId(data.id);
        setContent(data.content || '');
      } else {
        setDocId(null);
        setContent('');
      }
      setLoading(false);
    };

    fetchDocument();
  }, [projectId]);

  // 2. Debounced auto-save / upsert logic
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!projectId) return;

      const payload: { id?: string; project_id: string; content: string; updated_at: string } = {
        project_id: projectId,
        content: newContent,
        updated_at: new Date().toISOString(),
      };

      if (docId) {
        payload.id = docId;
      }

      const { data, error } = await supabase
        .from('documents')
        .upsert(payload, { onConflict: 'project_id' })
        .select()
        .single();

      if (error) {
        console.error('Auto-save failed:', error);
        setSaveStatus('error');
      } else {
        if (data?.id) setDocId(data.id);
        setSaveStatus('saved');
      }
    }, 1500);
  };

  return (
    <aside className={`doc-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="doc-sidebar-header">
        <h3 className="doc-sidebar-title">Project Notes</h3>
        <div className="doc-sidebar-actions">
          <button className="btn-close-sidebar" onClick={onToggle}>
            ✕
          </button>
        </div>
      </div>

      {/* Editor Body */}
      {loading ? (
        <div className="doc-sidebar-empty">
          <p>Loading notes...</p>
        </div>
      ) : (
        <div className="doc-sidebar-editor">
          <div className="doc-status-bar">
            <span className={`doc-status ${saveStatus}`}>
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && 'All changes saved'}
              {saveStatus === 'error' && 'Failed to save'}
            </span>
          </div>
          <textarea
            className="doc-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write chords, song lyrics, or jam ideas..."
          />
        </div>
      )}
    </aside>
  );
};