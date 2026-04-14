
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'guest');
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'hold', 'revision', 'complete');
CREATE TYPE public.task_priority AS ENUM ('urgent', 'high', 'normal', 'low');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE(user_id, workspace_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _workspace_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND workspace_id = _workspace_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = _user_id AND workspace_id = _workspace_id)
$$;

CREATE POLICY "Members can view their workspaces" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners/admins can update workspace" ON public.workspaces FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), id, 'owner') OR public.has_role(auth.uid(), id, 'admin'));
CREATE POLICY "Owners can delete workspace" ON public.workspaces FOR DELETE TO authenticated USING (public.has_role(auth.uid(), id, 'owner'));

CREATE POLICY "Members can view workspace members" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners/admins can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), workspace_id, 'owner') OR public.has_role(auth.uid(), workspace_id, 'admin'));
CREATE POLICY "Owners/admins can remove members" ON public.workspace_members FOR DELETE TO authenticated USING (public.has_role(auth.uid(), workspace_id, 'owner') OR public.has_role(auth.uid(), workspace_id, 'admin'));

CREATE POLICY "Members can view roles in their workspace" ON public.user_roles FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Owners can manage roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), workspace_id, 'owner'));
CREATE POLICY "Owners can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), workspace_id, 'owner'));
CREATE POLICY "Owners can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), workspace_id, 'owner'));

CREATE TABLE public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7C3AED',
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members can view spaces" ON public.spaces FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can create spaces" ON public.spaces FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND auth.uid() = created_by);
CREATE POLICY "Owners/admins can update spaces" ON public.spaces FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), workspace_id, 'owner') OR public.has_role(auth.uid(), workspace_id, 'admin'));
CREATE POLICY "Owners/admins can delete spaces" ON public.spaces FOR DELETE TO authenticated USING (public.has_role(auth.uid(), workspace_id, 'owner') OR public.has_role(auth.uid(), workspace_id, 'admin'));

CREATE TABLE public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view folders" ON public.folders FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can create folders" ON public.folders FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND public.is_workspace_member(auth.uid(), s.workspace_id)) AND auth.uid() = created_by);
CREATE POLICY "Admins can update folders" ON public.folders FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND (public.has_role(auth.uid(), s.workspace_id, 'owner') OR public.has_role(auth.uid(), s.workspace_id, 'admin'))));
CREATE POLICY "Admins can delete folders" ON public.folders FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND (public.has_role(auth.uid(), s.workspace_id, 'owner') OR public.has_role(auth.uid(), s.workspace_id, 'admin'))));

CREATE TABLE public.lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view lists" ON public.lists FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can create lists" ON public.lists FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND public.is_workspace_member(auth.uid(), s.workspace_id)) AND auth.uid() = created_by);
CREATE POLICY "Admins can update lists" ON public.lists FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND (public.has_role(auth.uid(), s.workspace_id, 'owner') OR public.has_role(auth.uid(), s.workspace_id, 'admin'))));
CREATE POLICY "Admins can delete lists" ON public.lists FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = space_id AND (public.has_role(auth.uid(), s.workspace_id, 'owner') OR public.has_role(auth.uid(), s.workspace_id, 'admin'))));

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'normal',
  due_date TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view tasks" ON public.tasks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.lists l JOIN public.spaces s ON s.id = l.space_id WHERE l.id = list_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.lists l JOIN public.spaces s ON s.id = l.space_id WHERE l.id = list_id AND public.is_workspace_member(auth.uid(), s.workspace_id)) AND auth.uid() = created_by);
CREATE POLICY "Members can update tasks" ON public.tasks FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.lists l JOIN public.spaces s ON s.id = l.space_id WHERE l.id = list_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Admins can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.lists l JOIN public.spaces s ON s.id = l.space_id WHERE l.id = list_id AND (public.has_role(auth.uid(), s.workspace_id, 'owner') OR public.has_role(auth.uid(), s.workspace_id, 'admin'))));

CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view task assignees" ON public.task_assignees FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t JOIN public.lists l ON l.id = t.list_id JOIN public.spaces s ON s.id = l.space_id WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can assign tasks" ON public.task_assignees FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t JOIN public.lists l ON l.id = t.list_id JOIN public.spaces s ON s.id = l.space_id WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can unassign tasks" ON public.task_assignees FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t JOIN public.lists l ON l.id = t.list_id JOIN public.spaces s ON s.id = l.space_id WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));

CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view comments" ON public.task_comments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks t JOIN public.lists l ON l.id = t.list_id JOIN public.spaces s ON s.id = l.space_id WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Members can add comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t JOIN public.lists l ON l.id = t.list_id JOIN public.spaces s ON s.id = l.space_id WHERE t.id = task_id AND public.is_workspace_member(auth.uid(), s.workspace_id)));
CREATE POLICY "Users can update own comments" ON public.task_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.task_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_workspace_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id) VALUES (NEW.id, NEW.created_by);
  INSERT INTO public.user_roles (user_id, workspace_id, role) VALUES (NEW.created_by, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_workspace_created AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.handle_workspace_created();

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON public.workspace_members(workspace_id);
CREATE INDEX idx_user_roles_user_workspace ON public.user_roles(user_id, workspace_id);
CREATE INDEX idx_spaces_workspace ON public.spaces(workspace_id);
CREATE INDEX idx_folders_space ON public.folders(space_id);
CREATE INDEX idx_lists_space ON public.lists(space_id);
CREATE INDEX idx_lists_folder ON public.lists(folder_id);
CREATE INDEX idx_tasks_list ON public.tasks(list_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);
