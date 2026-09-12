'use client';

// Project id → name map, so the dashboard can label each crew member's project
// without every row hitting the API.

import { useCallback, useEffect, useState } from 'react';
import { listProjects } from './api-client';
import { INTAKE_PROJECT_ID, INTAKE_PROJECT_NAME } from './project-constants';

export function useProjects() {
  const [names, setNames] = useState<string[]>([INTAKE_PROJECT_NAME]);
  const [byId, setById] = useState<Record<string, string>>({
    [INTAKE_PROJECT_ID]: INTAKE_PROJECT_NAME,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await listProjects();
      const map: Record<string, string> = { [INTAKE_PROJECT_ID]: INTAKE_PROJECT_NAME };
      for (const p of res.projects) map[p.id] = p.name;
      setById(map);
      setNames(res.names);
    } catch {
      // A failed project lookup is cosmetic — rows fall back to the raw id.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { names, byId, refresh };
}

export function projectLabel(byId: Record<string, string>, projectId: string): string {
  return byId[projectId] ?? projectId;
}
