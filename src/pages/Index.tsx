import { useState } from 'react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { KanbanBoard } from '@/components/board/KanbanBoard';

const Index = () => {
  const [activeList, setActiveList] = useState<string | null>('landing-pages');

  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar activeList={activeList} onSelectList={setActiveList} />
      <KanbanBoard listName="Landing Pages" />
    </div>
  );
};

export default Index;
