/** IS title/mode options; images in public/images/IStitles */
export const IS_TITLES = [
  { id: 'IS2', image: '/images/IStitles/IS2.jpeg', label: 'IS2' },
  { id: 'IS3', image: '/images/IStitles/IS3.jpeg', label: 'IS3' },
  { id: 'IS4', image: '/images/IStitles/IS4.jpeg', label: 'IS4' },
  { id: 'IS5', image: '/images/IStitles/IS5.jpeg', label: 'IS5' },
  { id: 'IS6', image: '/images/IStitles/IS6.jpeg', label: 'IS6' }
];

/** Squad options per title (no "default"); images in public/images/ISsquads/<titleId>/ */
export const IS_SQUADS_BY_TITLE: Record<string, Array<{ id: string; image: string; label: string }>> = {
  IS2: [
    { id: 'TAS', image: '/images/ISsquads/IS2/TAS.png', label: 'TAS' },
    { id: 'TDS', image: '/images/ISsquads/IS2/TDS.png', label: 'TDS' },
    { id: 'TFS', image: '/images/ISsquads/IS2/TFS.png', label: 'TFS' },
    { id: 'TRS', image: '/images/ISsquads/IS2/TRS.png', label: 'TRS' }
  ],
  IS3: [
    { id: 'POS', image: '/images/ISsquads/IS3/POS.png', label: 'POS' },
    { id: 'TAS', image: '/images/ISsquads/IS3/TAS.png', label: 'TAS' },
    { id: 'TDS', image: '/images/ISsquads/IS3/TDS.png', label: 'TDS' },
    { id: 'TFS', image: '/images/ISsquads/IS3/TFS.png', label: 'TFS' },
    { id: 'TRS', image: '/images/ISsquads/IS3/TRS.png', label: 'TRS' }
  ],
  IS4: [
    { id: 'STS', image: '/images/ISsquads/IS4/STS.png', label: 'STS' },
    { id: 'TAS', image: '/images/ISsquads/IS4/TAS.png', label: 'TAS' },
    { id: 'TDS', image: '/images/ISsquads/IS4/TDS.png', label: 'TDS' },
    { id: 'TFS', image: '/images/ISsquads/IS4/TFS.png', label: 'TFS' },
    { id: 'TRS', image: '/images/ISsquads/IS4/TRS.png', label: 'TRS' }
  ],
  IS5: [
    { id: 'MS', image: '/images/ISsquads/IS5/MS.png', label: 'MS' },
    { id: 'TAS', image: '/images/ISsquads/IS5/TAS.png', label: 'TAS' },
    { id: 'TDS', image: '/images/ISsquads/IS5/TDS.png', label: 'TDS' },
    { id: 'TFS', image: '/images/ISsquads/IS5/TFS.png', label: 'TFS' },
    { id: 'TRS', image: '/images/ISsquads/IS5/TRS.png', label: 'TRS' }
  ],
  IS6: [
    { id: 'GBO', image: '/images/ISsquads/IS6/GBO.png', label: 'GBO' },
    { id: 'HGBO', image: '/images/ISsquads/IS6/HGBO.png', label: 'HGBO' },
    { id: 'TAS', image: '/images/ISsquads/IS6/TAS.png', label: 'TAS' },
    { id: 'TDS', image: '/images/ISsquads/IS6/TDS.png', label: 'TDS' },
    { id: 'TFS', image: '/images/ISsquads/IS6/TFS.png', label: 'TFS' },
    { id: 'TRS', image: '/images/ISsquads/IS6/TRS.png', label: 'TRS' }
  ]
};
