import { useState } from 'react';

interface DeleteHistoryItem {
  id: string;
  type: 'message' | 'conversation' | 'thread';
  count?: number;
}

export const useDeleteHistoryModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<DeleteHistoryItem | null>(null);

  const openModal = (item: DeleteHistoryItem) => {
    setDeleteItem(item);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setDeleteItem(null);
  };

  const confirmDelete = (onDelete: (item: DeleteHistoryItem) => void) => {
    if (deleteItem) {
      onDelete(deleteItem);
    }
    closeModal();
  };

  return {
    isOpen,
    deleteItem,
    openModal,
    closeModal,
    confirmDelete
  };
};

export default useDeleteHistoryModal;