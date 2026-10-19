import { routes as catalog } from "../features/catalog";
import { routes as sessions } from "../features/sessions";
import { routes as runs } from "../features/runs";
import { routes as interactions } from "../features/interactions";
import { routes as assets } from "../features/assets";
import { routes as reviews } from "../features/reviews";
import { routes as schedules } from "../features/schedules";
import { routes as admin } from "../features/admin";
export const featureRoutes = <>
{catalog}
{sessions}
{runs}
{interactions}
{assets}
{reviews}
{schedules}
{admin}
</>;
