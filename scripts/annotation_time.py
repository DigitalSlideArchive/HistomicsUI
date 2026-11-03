#!/usr/bin/env python
# /// script
# requires-python = ">=3.11"
# dependencies = ["pymongo"]
# ///
"""
Estimate how long annotators spent editing annotations, using only what the
girder_large_image_annotation history already stores in Mongo.

Every save of an annotation (POST/PUT/PATCH from HistomicsUI) creates a new
``_version``.  With history enabled the superseded document is kept with
``_active: False`` and ``_annotationId`` pointing at the live document, and
every element of every version stays in ``annotationelement``.  Each version
therefore records one "edit event": ``updated`` (server time of that save) and
``updatedId`` (who saved it).  The HistomicsUI client saves after every change
to an element (coalescing changes while a save is in flight), so the sequence
of versions is a fairly fine-grained trace of editing activity.

VolView (girder_volview) annotations are different: every explicit Save in
VolView uploads a complete ``session.volview.zip`` as a *new* girder file,
either into the image item (item-scoped save) or as a new item in the folder
with ``meta.linkedResources`` naming the images (folder-scoped save).  The
file's ``created`` / ``creatorId`` is the only timing information; the zip's
``manifest.json`` holds the rulers, rectangles, polygons and segmentations.
With ``--elements`` the zips are read through girder's assetstore adapters so
consecutive saves can be diffed the same way annotation versions are.

This is meant to run inside the DSA girder container (``docker exec
<girder container> python annotation_time.py ...``): it needs the Mongo
database, which it finds via ``GIRDER_MONGO_URI`` or girder's config, and,
for ``--elements`` with VolView, the ``girder`` package so any assetstore
type can be read.  Outside the container, ``uv run annotation_time.py --uri
...`` works for everything except VolView session files that are not in a
locally readable filesystem assetstore.

See docs/annotation_time_tracking.md for what this data can and cannot show.

Usage:
    python annotation_time.py [--uri mongodb://host:27017/girder]
        [--gap 900] [--item ITEMID] [--user USER] [--elements] [--csv out.csv]
        [--source all|histomics|volview] [--exclude-singular] [--padding-cap 300]
"""
import argparse
import csv
import datetime
import hashlib
import io
import json
import os
import re
import statistics
import sys
import zipfile
from collections import defaultdict

from bson import ObjectId
from pymongo import MongoClient

EPOCH = datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
VOLVIEW_SESSION_RE = r'\.volview\.(zip|json)$'
VOLVIEW_TOOL_TYPES = ('rulers', 'rectangles', 'polygons')


def oid_time(oid):
    return oid.generation_time if isinstance(oid, ObjectId) else None


def utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt


def fmt(seconds):
    seconds = int(round(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return '%d:%02d:%02d' % (h, m, s) if h else '%d:%02d' % (m, s)


def element_hash(doc):
    """Hash an element's content, ignoring per-save fields."""
    el = {k: v for k, v in doc['element'].items() if k != 'id'}
    return hashlib.sha1(json.dumps(el, sort_keys=True, default=str).encode()).hexdigest()


def gather_versions(db, item=None):
    """
    Return {rootAnnotationId: [version dicts sorted by _version]}.

    Each version dict has: version, time, userId, creatorId, created, itemId,
    name, active, elementCount, supersededAt (ObjectId time of the inactive
    copy, i.e. roughly when the *next* save happened).
    """
    query = {}
    if item:
        query['itemId'] = ObjectId(item)
    lineages = defaultdict(list)
    for doc in db.annotation.find(query):
        if doc.get('annotationId') == 'version_sequence':
            continue
        root = doc.get('_annotationId', doc['_id'])
        lineages[root].append({
            'version': doc.get('_version'),
            'time': utc(doc.get('updated') or doc.get('created')),
            'userId': doc.get('updatedId') or doc.get('creatorId'),
            'creatorId': doc.get('creatorId'),
            'created': utc(doc.get('created')),
            'itemId': doc.get('itemId'),
            'name': (doc.get('annotation') or {}).get('name'),
            'active': doc.get('_active', True),
            'elementCount': doc.get('_elementCount'),
            'supersededAt': oid_time(doc['_id']) if '_annotationId' in doc else None,
        })
    for versions in lineages.values():
        versions.sort(key=lambda v: (v['version'] is None, v['version']))
    return lineages


def element_deltas(db, root, versions):
    """Annotate each version with added/removed/modified element counts."""
    prev = None
    for v in versions:
        cur = {}
        for doc in db.annotationelement.find(
                {'annotationId': root, '_version': v['version']},
                {'element': True}):
            cur[doc['element'].get('id', str(doc['_id']))] = element_hash(doc)
        if v['elementCount'] is None:
            v['elementCount'] = len(cur)
        if prev is not None:
            v['added'] = len(set(cur) - set(prev))
            v['removed'] = len(set(prev) - set(cur))
            v['modified'] = sum(1 for k in set(cur) & set(prev) if cur[k] != prev[k])
        else:
            v['added'], v['removed'], v['modified'] = len(cur), 0, 0
        prev = cur


def volview_lineage(file, item):
    """
    Key identifying what a VolView save is "of", so saves can be chained.

    Item-scoped saves go into the image item itself; folder-scoped saves each
    create a new session item in the folder whose ``meta.linkedResources``
    records the images (or a metadata filter) the session was opened on.
    """
    if not re.search(VOLVIEW_SESSION_RE, item.get('name', '')):
        return 'item:%s' % item['_id']
    linked = (item.get('meta') or {}).get('linkedResources') or {}
    return 'folder:%s:%s' % (item.get('folderId'), json.dumps(linked, sort_keys=True, default=str))


def gather_volview_saves(db, item=None):
    """
    Return a list of VolView save events, one per ``*.volview.zip`` /
    ``*.volview.json`` file, oldest first.
    """
    files = list(db.file.find({'name': {'$regex': VOLVIEW_SESSION_RE}}))
    item_ids = {f['itemId'] for f in files if f.get('itemId')}
    items = {i['_id']: i for i in db.item.find({'_id': {'$in': list(item_ids)}})}
    saves = []
    for f in files:
        it = items.get(f.get('itemId'))
        if it is None:
            continue
        linked = (it.get('meta') or {}).get('linkedResources') or {}
        linked_items = [str(i) for i in linked.get('items') or []]
        lineage = volview_lineage(f, it)
        if item and str(it['_id']) != item and item not in linked_items:
            continue
        saves.append({
            'source': 'volview',
            'annotationId': lineage,
            'version': None,
            'time': utc(f.get('created')),
            'userId': f.get('creatorId') or it.get('creatorId'),
            'creatorId': it.get('creatorId'),
            'created': utc(it.get('created')),
            # For folder-scoped saves the "item" is the folder the session
            # item lives in; the linked images are listed separately.
            'itemId': it['_id'] if lineage.startswith('item:') else it.get('folderId'),
            'linkedItems': linked_items,
            'name': f.get('name'),
            'active': True,
            'elementCount': None,
            'supersededAt': None,
            'fileId': f['_id'],
            'size': f.get('size'),
            'file': f,
        })
    saves.sort(key=lambda r: (r['time'] is None, r['time']))
    return saves


class VolViewFetcher:
    """
    Read session files.  Inside the girder container, girder's assetstore
    adapters handle every assetstore type; otherwise only files in a locally
    readable filesystem assetstore can be read.
    """

    def __init__(self, db):
        self.roots = {a['_id']: a.get('root') for a in db.assetstore.find({'type': 0})}
        try:
            from girder.models.file import File
            self.file_model = File()
        except ImportError:
            self.file_model = None
        self.warned = False

    def read(self, save):
        if self.file_model is not None:
            with self.file_model.open(save['file']) as fp:
                return fp.read()
        root = self.roots.get(save['file'].get('assetstoreId'))
        path = os.path.join(root or '', save['file'].get('path') or '')
        if root and os.path.exists(path):
            with open(path, 'rb') as fp:
                return fp.read()
        if not self.warned:
            print('Cannot read VolView session files outside the girder container unless '
                  'the filesystem assetstore is readable locally', file=sys.stderr)
            self.warned = True
        return None


def default_mongo_uri():
    """The database URI the girder container uses, or localhost."""
    uri = os.environ.get('GIRDER_MONGO_URI')
    if not uri:
        try:
            from girder.utility import config
            uri = config.getConfig().get('database', {}).get('uri')
        except ImportError:
            pass
    return uri or 'mongodb://localhost:27017/girder'


def parse_volview_session(data, name):
    """
    Summarize a VolView session file.

    Returns {'tools': {toolKey: contentHash}, 'counts': {type: n},
    'segmentations': n, 'masks': {maskKey: crc}, 'labelmapBytes': n} or None.
    """
    manifest, entries = None, {}
    if name.endswith('.zip'):
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            return None
        for info in zf.infolist():
            entries[info.filename] = info
        mname = next((n for n in entries if n.rsplit('/', 1)[-1] == 'manifest.json'), None)
        if mname is None:
            return None
        manifest = json.loads(zf.read(mname))
    else:
        manifest = json.loads(data)
    tools, counts = {}, {}
    for ttype in VOLVIEW_TOOL_TYPES:
        for tool in ((manifest.get('tools') or {}).get(ttype) or {}).get('tools') or []:
            content = {k: v for k, v in tool.items() if k != 'id'}
            h = hashlib.sha1(json.dumps(content, sort_keys=True).encode()).hexdigest()
            # VolView tool ids are stable across saves when present.
            key = '%s:%s' % (ttype, tool.get('id') or h)
            tools[key] = h
            counts[ttype] = counts.get(ttype, 0) + 1
    # 6.4+: segmentations[].masks[].representations.labelmap.path
    # 6.2: segmentGroups[].path, older: labelMaps[].path
    masks, lm_bytes, n_seg = {}, 0, 0
    for seg in manifest.get('segmentations') or []:
        n_seg += 1
        for mask in seg.get('masks') or []:
            path = ((mask.get('representations') or {}).get('labelmap') or {}).get('path')
            info = entries.get(path)
            masks['%s/%s' % (seg.get('id'), mask.get('id'))] = info.CRC if info else path
            lm_bytes += info.file_size if info else 0
    for key in ('segmentGroups', 'labelMaps'):
        for seg in manifest.get(key) or []:
            n_seg += 1
            info = entries.get(seg.get('path'))
            masks[str(seg.get('id'))] = info.CRC if info else seg.get('path')
            lm_bytes += info.file_size if info else 0
    return {'tools': tools, 'counts': counts, 'segmentations': n_seg,
            'masks': masks, 'labelmapBytes': lm_bytes,
            'version': manifest.get('version')}


def volview_deltas(saves, fetcher):
    """Read each save's manifest and diff it against the previous save in its lineage."""
    prev = {}
    for s in saves:
        data = fetcher.read(s)
        summary = parse_volview_session(data, s['name']) if data else None
        s['summary'] = summary
        if summary is None:
            continue
        s['elementCount'] = sum(summary['counts'].values()) + summary['segmentations']
        p = prev.get(s['annotationId'])
        cur, old = summary['tools'], (p or {}).get('tools', {})
        s['added'] = len(set(cur) - set(old))
        s['removed'] = len(set(old) - set(cur))
        s['modified'] = sum(1 for k in set(cur) & set(old) if cur[k] != old[k])
        cm, om = summary['masks'], (p or {}).get('masks', {})
        s['masksChanged'] = (len(set(cm) ^ set(om)) +
                             sum(1 for k in set(cm) & set(om) if cm[k] != om[k]))
        prev[s['annotationId']] = summary


def sessions_from_events(times, gap):
    """Split sorted datetimes into sessions separated by more than ``gap`` s."""
    sessions = []
    for t in times:
        if sessions and (t - sessions[-1][-1]).total_seconds() <= gap:
            sessions[-1].append(t)
        else:
            sessions.append([t])
    return sessions


def active_time(times, gap):
    """Sum of session spans for a list of event times."""
    return sum((s[-1] - s[0]).total_seconds() for s in sessions_from_events(sorted(times), gap))


def user_stats(rows, gap, padding_cap, by_item=False):
    """
    Group edit events per user (or per user and item) and compute sessions.

    Returns {key: {'times', 'sources', 'sessions', 'active', 'padded',
    'medianGap', 'annotations', 'items'}} where ``padded`` credits each
    session's first save with one median in-session interval, capped at
    ``padding_cap`` seconds.
    """
    groups = defaultdict(list)
    for r in rows:
        if r['time'] is None:
            continue
        key = (r['userId'], r['itemId']) if by_item else (r['userId'],)
        groups[key].append(r)
    stats = {}
    for key, rs in groups.items():
        rs.sort(key=lambda r: r['time'])
        times = [r['time'] for r in rs]
        sessions = sessions_from_events(times, gap)
        gaps = [(b - a).total_seconds() for a, b in zip(times, times[1:])]
        in_session = [g for g in gaps if g <= gap]
        median_gap = statistics.median(in_session) if in_session else 0
        active = sum((x[-1] - x[0]).total_seconds() for x in sessions)
        stats[key] = {
            'times': times,
            'sources': [r.get('source', 'histomics') for r in rs],
            'sessions': sessions,
            'active': active,
            'padded': active + min(median_gap, padding_cap) * len(sessions),
            'medianGap': median_gap,
            'annotations': {r['annotationId'] for r in rs},
            # Folder-scoped VolView saves count their linked images, not the folder.
            'items': {i for r in rs for i in (
                [ObjectId(x) for x in r['linkedItems']] if r.get('linkedItems')
                else [r['itemId']]) if i},
        }
    return stats


def write_csv(path, rows, users):
    fields = ['source', 'annotationId', 'itemId', 'name', 'version', 'time', 'userId', 'user',
              'active', 'elementCount', 'added', 'removed', 'modified', 'masksChanged',
              'supersededAt', 'fileId', 'size', 'linkedItems']
    with open(path, 'w', newline='') as fp:
        w = csv.DictWriter(fp, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        for r in rows:
            w.writerow(dict(r, user=users.get(r['userId'], r['userId']),
                            linkedItems=' '.join(r.get('linkedItems') or [])))


def print_annotations(lineages, users, items, gap, with_elements):
    print('Per annotation (versions kept in history):')
    for root, versions in sorted(lineages.items(), key=lambda kv: kv[1][0]['time'] or EPOCH):
        times = [v['time'] for v in versions if v['time']]
        if not times:
            continue
        last = versions[-1]
        editors = sorted({users.get(v['userId'], str(v['userId'])) for v in versions})
        span = (max(times) - min(times)).total_seconds()
        active = sum((s[-1] - s[0]).total_seconds() for s in sessions_from_events(times, gap))
        extra = ''
        if with_elements:
            extra = '  +%d/-%d/~%d elements' % (
                sum(v.get('added', 0) for v in versions),
                sum(v.get('removed', 0) for v in versions),
                sum(v.get('modified', 0) for v in versions))
        if not last['active']:
            extra += ' (deleted)'
        print('  %s %-30s item=%s versions=%d editors=%s span=%s active=%s%s' % (
            root, (last['name'] or '')[:30], items.get(last['itemId'], last['itemId']),
            len(versions), ','.join(editors), fmt(span), fmt(active), extra))


def print_volview(saves, users, items, gap, with_contents):
    print('\nPer VolView session lineage (one save = one explicit Save in VolView):')
    lineages = defaultdict(list)
    for s in saves:
        lineages[s['annotationId']].append(s)
    for key, svs in sorted(lineages.items(), key=lambda kv: kv[1][0]['time'] or EPOCH):
        times = [s['time'] for s in svs if s['time']]
        if not times:
            continue
        editors = sorted({users.get(s['userId'], str(s['userId'])) for s in svs})
        span = (max(times) - min(times)).total_seconds()
        active = sum((x[-1] - x[0]).total_seconds() for x in sessions_from_events(times, gap))
        last = svs[-1]
        scope, _, rest = key.partition(':')
        if scope == 'item':
            target = 'item=%s' % items.get(last['itemId'], last['itemId'])
        else:
            target = 'folder=%s linked=%s' % (
                items.get(last['itemId'], last['itemId']),
                ','.join(str(items.get(ObjectId(i), i)) for i in last['linkedItems'])
                if last['linkedItems'] else rest.partition(':')[2])
        extra = ''
        if with_contents and last.get('summary'):
            sm = last['summary']
            extra = '  last: %s segmentations=%d (%d kB)  +%d/-%d/~%d tools, %d mask changes' % (
                ' '.join('%s=%d' % kv for kv in sorted(sm['counts'].items())) or 'no tools',
                sm['segmentations'], sm['labelmapBytes'] // 1024,
                sum(s.get('added', 0) for s in svs), sum(s.get('removed', 0) for s in svs),
                sum(s.get('modified', 0) for s in svs),
                sum(s.get('masksChanged', 0) for s in svs))
        print('  %s saves=%d editors=%s span=%s active=%s%s' % (
            target, len(svs), ','.join(editors), fmt(span), fmt(active), extra))
        for s in svs:
            print('      %s %s %s %s' % (
                s['time'].strftime('%Y-%m-%d %H:%M:%S'), users.get(s['userId'], s['userId']),
                s['name'], '%d kB' % ((s['size'] or 0) // 1024) if s.get('size') else ''))


def print_sessions(rows, users, items, gap, padding_cap, by_item):
    print('\nPer user sessions (gap > %gs starts a new session):' % gap)
    stats = user_stats(rows, gap, padding_cap, by_item)
    for key, st in sorted(stats.items(), key=lambda kv: str(kv[0])):
        n_vv = st['sources'].count('volview')
        composition = ''
        if n_vv:
            composition = ' (%d histomics, %d volview)' % (len(st['times']) - n_vv, n_vv)
        label = users.get(key[0], str(key[0]))
        if by_item:
            label += ' / ' + str(items.get(key[1], key[1]))
        print('  %s: saves=%d%s sessions=%d active=%s (padded %s) median gap=%s' % (
            label, len(st['times']), composition, len(st['sessions']), fmt(st['active']),
            fmt(st['padded']), fmt(st['medianGap'])))
        for x in st['sessions']:
            print('      %s -> %s  (%s, %d saves)' % (
                x[0].strftime('%Y-%m-%d %H:%M:%S'), x[-1].strftime('%H:%M:%S'),
                fmt((x[-1] - x[0]).total_seconds()), len(x)))


def print_summary(rows, users, gap, padding_cap):
    print('\nPer user summary (estimate = active time plus one median interval, at most %s, '
          'per session):' % fmt(padding_cap))
    stats = user_stats(rows, gap, padding_cap)
    print('  %-20s %11s %5s %5s %8s %10s %10s' % (
        'user', 'annotations', 'items', 'saves', 'sessions', 'active', 'estimate'))
    for key, st in sorted(stats.items(), key=lambda kv: -kv[1]['padded']):
        print('  %-20s %11d %5d %5d %8d %10s %10s' % (
            users.get(key[0], str(key[0])), len(st['annotations']), len(st['items']),
            len(st['times']), len(st['sessions']), fmt(st['active']), fmt(st['padded'])))


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--uri', default=default_mongo_uri(),
                   help='Mongo URI of the girder database (default: GIRDER_MONGO_URI, '
                   'girder config, or %(default)s)')
    p.add_argument('--gap', type=float, default=900,
                   help='seconds of inactivity that ends a session (default 900, which is '
                   'what the annotation history UI uses to group versions)')
    p.add_argument('--padding-cap', type=float, default=300,
                   help='upper limit in seconds for the per-session padding added to the '
                   'estimate (default 300)')
    p.add_argument('--item', help='restrict to annotations on this item id')
    p.add_argument('--user', help='restrict to this user id or login')
    p.add_argument('--elements', action='store_true',
                   help='also diff elements between annotation versions and tools between '
                   'VolView saves (slower; reading VolView session files needs the girder '
                   'package or a locally readable filesystem assetstore)')
    p.add_argument('--exclude-singular', action='store_true',
                   help='ignore annotations whose active time is zero (a single version, '
                   'or every edit farther apart than --gap)')
    p.add_argument('--csv', help='write one row per version to this file')
    p.add_argument('--by-item', action='store_true',
                   help='compute sessions per (user, item) instead of per user')
    p.add_argument('--source', choices=['all', 'histomics', 'volview'], default='all',
                   help='which annotation sources to report (default all)')
    args = p.parse_args()

    client = MongoClient(args.uri)
    db = client.get_default_database()
    users = {u['_id']: u.get('login', str(u['_id'])) for u in db.user.find({}, {'login': True})}
    items = {i['_id']: i.get('name', str(i['_id'])) for i in db.item.find({}, {'name': True})}
    items.update({f['_id']: f.get('name', str(f['_id']))
                  for f in db.folder.find({}, {'name': True})})

    lineages, saves = {}, []
    if args.source != 'volview':
        lineages = gather_versions(db, args.item)
        if args.elements:
            for root, versions in lineages.items():
                element_deltas(db, root, versions)
    if args.source != 'histomics':
        saves = gather_volview_saves(db, args.item)
        if args.elements and saves:
            volview_deltas(saves, VolViewFetcher(db))
    if args.exclude_singular:
        lineages = {root: versions for root, versions in lineages.items()
                    if active_time([v['time'] for v in versions if v['time']], args.gap) > 0}
        by_lineage = defaultdict(list)
        for sv in saves:
            by_lineage[sv['annotationId']].append(sv)
        saves = [sv for svs in by_lineage.values()
                 if active_time([sv['time'] for sv in svs if sv['time']], args.gap) > 0
                 for sv in svs]

    rows = [dict(v, annotationId=root, source='histomics')
            for root, versions in lineages.items()
            for v in versions]
    rows += saves
    rows = [r for r in rows if not args.user or
            args.user in (str(r['userId']), users.get(r['userId']))]
    rows.sort(key=lambda r: (r['time'] is None, r['time']))

    if args.csv:
        write_csv(args.csv, rows, users)
    if lineages:
        print_annotations(lineages, users, items, args.gap, args.elements)
    if saves:
        print_volview(saves, users, items, args.gap, args.elements)
    print_sessions(rows, users, items, args.gap, args.padding_cap, args.by_item)
    print_summary(rows, users, args.gap, args.padding_cap)


if __name__ == '__main__':
    sys.exit(main())
