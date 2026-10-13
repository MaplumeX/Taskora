import { render } from '@testing-library/react';
import { ProjectStatus, Start } from '@taskora/shared';
import { describe, expect, it } from 'vitest';

import { ProjectProgressPie } from './ProjectProgressRing';

function renderPie(projectStatus: ProjectStatus, start?: Start) {
  const { container } = render(
    <ProjectProgressPie total={4} completed={2} projectStatus={projectStatus} start={start} />,
  );
  const [track, pie] = Array.from(container.querySelectorAll('circle'));
  return { track, pie };
}

describe('ProjectProgressPie', () => {
  it('draws an active Someday project as a gray dashed track with a gray pie', () => {
    const { track, pie } = renderPie(ProjectStatus.ACTIVE, Start.SOMEDAY);

    expect(track.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(track.getAttribute('class')).toContain('text-muted-foreground');
    expect(pie.getAttribute('class')).toContain('text-muted-foreground');
  });

  it('draws an Anytime project with a solid theme-colored track and pie', () => {
    const { track, pie } = renderPie(ProjectStatus.ACTIVE, Start.ANYTIME);

    expect(track.getAttribute('stroke-dasharray')).toBeNull();
    expect(track.getAttribute('class')).toContain('text-primary');
    expect(pie.getAttribute('class')).toContain('text-primary');
  });

  it('drops the Someday style once the project is completed', () => {
    const { track } = renderPie(ProjectStatus.COMPLETED, Start.SOMEDAY);

    expect(track.getAttribute('stroke-dasharray')).toBeNull();
    expect(track.getAttribute('class')).toContain('text-primary');
  });
});
