import { SearchX } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="找不到这个页面"
      actions={
        <Link to="/">
          <Button variant="primary">回到首页</Button>
        </Link>
      }
    />
  );
}
