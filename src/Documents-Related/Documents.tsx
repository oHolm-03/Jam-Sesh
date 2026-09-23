import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './Documents.css';

interface Document {
  id: string;
  project_id: string;
  title: string;
  content: string;
  updated_at: string;
}

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
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [content, setContent] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const fetchDocuments = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching docs:', error);
        return;
      }

      setDocuments(data || []);
      if (data && data.length > 0) {
        setActiveDoc(data[0]);
        setContent(data[0].content || '');
      }
    };

    fetchDocuments();
  }, [projectId]);

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    setSaveStatus('saving');

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (!activeDoc) return;

      const { error } = await supabase
        .from('documents')
        .update({
          content: newContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeDoc.id);

      if (error) {
        console.error('Auto-save failed:', error);
        setSaveStatus('error');
      } else {
        setSaveStatus('saved');
      }
    }, 1500);
  };

  const handleCreateDocument = async () => {
    const { data, error } = await supabase
      .from('documents')
      .insert([
        {
          project_id: projectId,
          title: 'New Jam Note',
          content: '',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating doc:', error);
      return;
    }

    setDocuments((prev) => [data, ...prev]);
    setActiveDoc(data);
    setContent('');
  };

  return (
    <aside className={`doc-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="doc-sidebar-header">
        <h3 className="doc-sidebar-title">Project Notes</h3>
        <div className="doc-sidebar-actions">
          <button className="btn-create-doc" onClick={handleCreateDocument}>
            + New
          </button>
          <button className="btn-close-sidebar" onClick={onToggle}>
            ✕
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="doc-sidebar-tabs">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => {
              setActiveDoc(doc);
              setContent(doc.content || '');
            }}
            className={`doc-tab ${activeDoc?.id === doc.id ? 'active' : ''}`}
          >
            {doc.title}
          </button>
        ))}
      </div>

      {/* Editor Body */}
      {activeDoc ? (
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
      ) : (
        <div className="doc-sidebar-empty">
          <p>No documents in this project yet. Click "+ New" to create one.</p>
        </div>
      )}
    </aside>
  );
};