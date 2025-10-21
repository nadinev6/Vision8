import React from 'react';
import { TrashIcon, XIcon } from './icons';

interface DeleteHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType?: 'message' | 'conversation' | 'thread';
  itemCount?: number;
}

const DeleteHistoryModal: React.FC<DeleteHistoryModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemType = 'message',
  itemCount = 1
}) => {
  if (!isOpen) return null;

  const getTitle = () => {
    if (itemType === 'conversation') return 'Delete Conversation';
    if (itemType === 'thread') return 'Delete Thread';
    return 'Delete Message';
  };

  const getDescription = () => {
    if (itemType === 'conversation') {
      return 'Are you sure you want to delete this entire conversation? This will remove all messages and cannot be undone.';
    }
    if (itemType === 'thread') {
      return `Are you sure you want to delete this thread? This will remove ${itemCount > 1 ? `${itemCount} messages` : '1 message'} and cannot be undone.`;
    }
    return 'Are you sure you want to delete this message? This action cannot be undone.';
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-card rounded-lg shadow-xl border border-border max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <TrashIcon className="w-5 h-5 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {getTitle()}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
          >
            <XIcon className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {getDescription()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-sm font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md transition-colors"
          >
            Delete {itemType === 'conversation' ? 'Conversation' : itemType === 'thread' ? 'Thread' : 'Message'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteHistoryModal;