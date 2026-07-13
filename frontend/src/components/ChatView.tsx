import { Fragment } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useAppStore } from '../stores/appStore';
import ChatPane from './ChatPane';
import { Hash, PanelLeftOpen } from 'lucide-react';

export default function ChatView() {
  const paneRoomIds = useAppStore((s) => s.paneRoomIds);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const isGrid = useAppStore((s) => s.config?.splitLayout === 'grid');
  const editMode = useAppStore((s) => s.layoutEditMode);
  const gridMirror = useAppStore((s) => s.gridMirror);
  const moveGridBottomChat = useAppStore((s) => s.moveGridBottomChat);

  if (paneRoomIds.length === 0) {
    return (
      <div className="flex-1 flex flex-col bg-discord-main">
        {sidebarCollapsed && (
          <div className="h-12 px-2 flex items-center border-b border-discord-dark/60 shrink-0">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors"
              title="Show sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-discord-text-muted">
            <Hash size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-xl font-semibold mb-2">No room selected</p>
            <p className="text-sm">Create a room and add some Discord channels to get started.</p>
          </div>
        </div>
      </div>
    );
  }

  const count = paneRoomIds.length;
  const vHandleCls = `h-1 bg-discord-dark transition-colors ${editMode ? 'hover:bg-discord-blurple cursor-row-resize' : ''}`;
  const hHandleCls = `w-1 bg-discord-dark transition-colors ${editMode ? 'hover:bg-discord-blurple cursor-col-resize' : ''}`;

  if (count === 1) {
    return <ChatPane roomId={paneRoomIds[0]} paneIndex={0} paneCount={1} editMode={editMode} />;
  }

  // Two-rows / grid mode: columns-first so each column's height splits are
  // independent (resizing one chat's height never moves another column's chats).
  if (isGrid) {
    const numCols = Math.ceil(count / 2);
    const columns: number[][] = Array.from({ length: numCols }, () => []);
    for (let i = 0; i < count; i++) columns[Math.floor(i / 2)].push(i);
    // Mirror flips which side the columns sit on (e.g. moves the lone
    // full-height pane in a 3-pane layout to the left or right).
    if (gridMirror) columns.reverse();

    return (
      <div className="flex-1 flex min-w-0">
        <PanelGroup direction="horizontal" autoSaveId={`trenchcord-grid-${count}-${gridMirror ? 'm' : 'n'}`} key={`grid-${count}-${gridMirror ? 'm' : 'n'}`} className="flex-1">
          {columns.map((col, ci) => (
            <Fragment key={ci}>
              {ci > 0 && <PanelResizeHandle disabled={!editMode} className={hHandleCls} />}
              <Panel id={`col-${ci}`} order={ci} minSize={15} defaultSize={100 / numCols}>
                {col.length === 1 ? (
                  <ChatPane
                    roomId={paneRoomIds[col[0]]}
                    paneIndex={col[0]}
                    paneCount={count}
                    editMode={editMode}
                  />
                ) : (
                  <PanelGroup direction="vertical" autoSaveId={`trenchcord-grid-${count}-col-${ci}`} className="h-full">
                    {col.map((idx, ri) => {
                      // In a 3-pane grid, the bottom chat of the stacked column can be
                      // moved to the other column's bottom (staying at the bottom row).
                      const isBottomOfStack = count === 3 && col.length === 2 && ri === col.length - 1;
                      return (
                        <Fragment key={idx}>
                          {ri > 0 && <PanelResizeHandle disabled={!editMode} className={vHandleCls} />}
                          <Panel id={`cell-${idx}`} order={ri} minSize={15} defaultSize={100 / col.length}>
                            <ChatPane
                              roomId={paneRoomIds[idx]}
                              paneIndex={idx}
                              paneCount={count}
                              editMode={editMode}
                              onMoveLeft={isBottomOfStack && gridMirror ? moveGridBottomChat : undefined}
                              onMoveRight={isBottomOfStack && !gridMirror ? moveGridBottomChat : undefined}
                            />
                          </Panel>
                        </Fragment>
                      );
                    })}
                  </PanelGroup>
                )}
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      </div>
    );
  }

  // Single-row mode (1xN)
  return (
    <div className="flex-1 flex min-w-0">
      <PanelGroup direction="horizontal" autoSaveId={`trenchcord-row-${count}`} key={`row-${count}`} className="flex-1">
        {paneRoomIds.map((rid, i) => (
          <Fragment key={i}>
            {i > 0 && <PanelResizeHandle disabled={!editMode} className={hHandleCls} />}
            <Panel id={`pane-${i}`} order={i} minSize={15} defaultSize={100 / count}>
              <ChatPane roomId={rid} paneIndex={i} paneCount={count} editMode={editMode} />
            </Panel>
          </Fragment>
        ))}
      </PanelGroup>
    </div>
  );
}
