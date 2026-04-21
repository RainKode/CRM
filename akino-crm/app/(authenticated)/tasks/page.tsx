import { getTasks } from "./actions";
import { TasksView } from "./tasks-view";

export default async function TasksPage() {
  const initialTasks = await getTasks("open");
  return <TasksView initialTasks={initialTasks} />;
}
