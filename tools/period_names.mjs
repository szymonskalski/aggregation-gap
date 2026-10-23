// Country names as they stood in a given year, from CShapes 2.0 names (which keep one name per unit).
export function periodName(name, year) {
  const y = +year;
  const special = {
    'Russia (Soviet Union)': y < 1992 ? 'U.S.S.R.' : 'RUSSIA',
    'United States of America': 'UNITED STATES',
    'German Federal Republic': y < 1950 ? 'GERMANY (WESTERN ZONES)' : y < 1991 ? 'GERMAN FED. REP.' : 'GERMANY',
    'German Democratic Republic': y < 1950 ? 'GERMANY (SOVIET ZONE)' : 'GERMAN DEM. REP.',
    'Vietnam, Democratic Republic of': y < 1976 ? 'NORTH VIETNAM' : 'VIETNAM',
    'Vietnam, Republic of': 'SOUTH VIETNAM',
    'Vietnam (Annam/Cochin China/Tonkin)': 'VIETNAM',
    'Yemen (Arab Republic of Yemen)': y < 1990 ? 'NORTH YEMEN' : 'YEMEN',
    "Yemen, People's Republic of": 'SOUTH YEMEN',
    'Korea, Republic of': 'SOUTH KOREA',
    "Korea, People's Republic of": 'NORTH KOREA',
    'Congo, Democratic Republic of (Zaire)': y < 1971 ? 'CONGO' : y < 1997 ? 'ZAIRE' : 'DEM. REP. OF THE CONGO',
    'Congo': 'CONGO',
    'Myanmar (Burma)': y < 1989 ? 'BURMA' : 'MYANMAR',
    'Zimbabwe (Rhodesia)': y < 1980 ? 'RHODESIA' : 'ZIMBABWE',
    'Sri Lanka (Ceylon)': y < 1972 ? 'CEYLON' : 'SRI LANKA',
    'Burkina Faso (Upper Volta)': y < 1985 ? 'UPPER VOLTA' : 'BURKINA FASO',
    'Cambodia (Kampuchea)': y >= 1976 && y < 1990 ? 'KAMPUCHEA' : 'CAMBODIA',
    'Swaziland (Eswatini)': y < 2018 ? 'SWAZILAND' : 'ESWATINI',
    'Macedonia (FYROM/North Macedonia)': y < 2019 ? 'MACEDONIA' : 'NORTH MACEDONIA',
    'Tanzania (Tanganyika)': y < 1964 ? 'TANGANYIKA' : 'TANZANIA',
    'West Irian (Dutch New Guinea)': y < 1963 ? 'NETH. NEW GUINEA' : 'WEST IRIAN',
    'Sabah (North Borneo)': 'NORTH BORNEO',
    'British Somaliland (Somaliland Republic)': 'BRITISH SOMALILAND',
    'Federation of Rhodesia and Nyasaland': 'FED. OF RHODESIA AND NYASALAND',
    'Italy/Sardinia': 'ITALY',
    'Rumania': 'ROMANIA',
    'Kyrgyz Republic': 'KYRGYZSTAN',
    'Bosnia-Herzegovina': 'BOSNIA AND HERZEGOVINA',
    "Cote D'Ivoire": y < 1986 ? 'IVORY COAST' : 'CÔTE D’IVOIRE',
    'Surinam': y < 1978 ? 'SURINAM' : 'SURINAME',
    'French Guyana': 'FRENCH GUIANA',
    'New Caledonia and Dependencies': 'NEW CALEDONIA',
    'Reunion': 'RÉUNION',
  };
  if (special[name]) return special[name];
  return name.replace(/\s*\(.*?\)/g, '').replace(/,.*$/, '').toUpperCase();
}
