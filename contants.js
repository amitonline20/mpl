const PATCH_CATEGORIES = {
  GEN: "General",
  EMG: "Emergency",
  ACT: "Active",
  LTD: "Limited",
  DBG: "Debug",
  OBS: "Obsolete",
  OBE: "Obsoleted by Event",
  PRIVATE: "Private"
};

const PATCH_STATUS = {
  1: "OPEN",
  2: "SUBMITTED",
  3: "VO",
  4: "RELEASED",
  5: "GA_READY"
};

const RECOVERABLE = [
  'DPI-1010', // not connected
  'ORA-03113', // end-of-file on communication channel
  'ORA-03114', // not connected to Oracle
  'ORA-12514', // listener does not currently know of service requested
  'ORA-12541', // TNS:no listener
  'ORA-25408', // cannot safely replay
  'ORA-00028', // your session has been killed
];

const LOCAL_FOLDER_FOR_PATCHES = "MPL-17-sep";

const PATCH_ACCESS = {
  ALL_DOWNLOADS: "ALL_DOWNLOADS",
  AVAYA_ONLY_DOWNLOAD: "AVAYA_ONLY_DOWNLOAD"
};

// Restriction codes
const RESTRICTION_TYPE = {
  NONE: "NONE",
  ENTERPRISE: "ENT_PROD"
};


module.exports = {
    PATCH_CATEGORIES,
    PATCH_STATUS,
    RECOVERABLE,
    LOCAL_FOLDER_FOR_PATCHES,
    PATCH_ACCESS,
    RESTRICTION_TYPE
}
