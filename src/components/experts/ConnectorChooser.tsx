import { ChevronDown, Link2 } from "lucide-react";
import { useRef, useState } from "react";
import type { McpConnector } from "../../lib/catalog";
import { usePopoverClose } from "../../lib/usePopoverClose";
import { Button } from "../../ui/Button";
import { ChooserPanel } from "../../ui/ChooserPanel";
import { Chip, ChipList } from "./Chip";
import { Input } from "../../ui/fields";
import { Option } from "../../ui/Option";

const TRIGGER =
  "flex h-9 w-full items-center justify-between rounded-control border border-input bg-card px-3 text-body text-foreground outline-none hover:border-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100";

interface ConnectorChooserProps {
  readonly chosen: readonly string[];
  /** 这里的连接器不多（都是自己配的），一次列全，按名字找。 */
  readonly connectors: readonly McpConnector[];
  readonly onToggle: (id: string) => void;
}

/** 默认连接器的选择器：已选的摆成胶囊，点「选择连接器」弹出列表勾选，和默认技能一个用法。 */
export function ConnectorChooser({ chosen, connectors, onToggle }: ConnectorChooserProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const box = useRef<HTMLDivElement>(null);
  usePopoverClose(open, box, () => setOpen(false));

  const needle = keyword.trim().toLowerCase();
  const found = needle ? connectors.filter((connector) => connector.name.toLowerCase().includes(needle)) : connectors;

  return (
    <div ref={box} className="relative">
      <ChipList
        label="已选连接器"
        chips={chosen.map((id) => {
          const connector = connectors.find((item) => item.id === id);
          return <Chip key={id} icon={Link2} iconClass="text-muted-foreground" label={connector?.name ?? id} onRemove={() => onToggle(id)} />;
        })}
      />
      <button type="button" data-testid="connector-chooser-trigger" aria-haspopup="listbox" aria-expanded={open} className={TRIGGER} onClick={() => setOpen((value) => !value)}>
        选择连接器
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      </button>
      {open ? (
        <ChooserPanel
          label="连接器列表"
          className="mt-1"
          header={<Input aria-label="搜索连接器" value={keyword} placeholder="搜索连接器" autoFocus onChange={(event) => setKeyword(event.target.value)} />}
          footer={
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              完成
            </Button>
          }
        >
          {found.map((connector) => (
            <Option key={connector.id} kind="checkbox" checked={chosen.includes(connector.id)} label={connector.name} id={connector.id} onClick={() => onToggle(connector.id)} />
          ))}
          {found.length === 0 ? <p className="px-3 py-2 text-caption text-muted-foreground">没有匹配的连接器。</p> : null}
        </ChooserPanel>
      ) : null}
    </div>
  );
}
