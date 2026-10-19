import { Construction } from "lucide-react";
import { EmptyState } from "../../ui/EmptyState";
import { PageBody, PageHeader } from "../../ui/PageHeader";
export default function Page({ title }: { title: string }) { return <><PageHeader title={title} /><PageBody><EmptyState icon={Construction} title="功能建设中" description="此页面将在后续功能包中交付。" /></PageBody></>; }
