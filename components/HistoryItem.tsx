import React from 'react';
import { TrashIcon } from './icons';
import DeleteHistoryModal from './DeleteHistoryModal';
import { useDeleteHistoryModal } from '../hooks/useDeleteHistoryModal';

interface HistoryItemProps {
  id: string;
  title: string;
  messageCount?: number;
  onDelete: (id: string) => void;
  type?: 'message' | 'conversation' | 'thread';
}

const HistoryItem: React.FC<HistoryItemProps> = ({
  id,
  title,
  messageCount = 1,
  onDelete,
  type = 'conversation'
}) => {
  const { isOpen, deleteItem, openModal, closeModal, confirmDelete } = useDeleteHistoryModal();

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openModal({
      id,
      type,
      count: messageCount
    });
  };

  const handleConfirmDelete = () => {
    confirmDelete((item) => {
      onDelete(item.id);
    });
  };

  return (
    <>
      <div className="flex items-center justify-between p-3 hover:bg-muted rounded-lg group">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {title}
          </h3>
          {messageCount > 1 && (
            <p className="text-xs text-muted-foreground">
              {messageCount} messages
            </p>
          )}
        </div>
        
        <button
          onClick={handleDeleteClick}
          className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full hover:bg-destructive/10 flex items-center justify-center transition-all"
          title={`Delete ${type}`}
        >
          <TrashIcon className="w-4 h-4 text-muted-foreground hover:text-destructive" />
        </button>
      </div>

      <DeleteHistoryModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirmDelete}
        itemType={deleteItem?.type}
        itemCount={deleteItem?.count}
      />
    </>
  );
};

export default HistoryItem;