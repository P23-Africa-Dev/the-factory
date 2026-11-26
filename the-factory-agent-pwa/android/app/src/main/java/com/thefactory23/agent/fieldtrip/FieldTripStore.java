package com.thefactory23.agent.fieldtrip;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.ArrayList;
import java.util.List;

/**
 * Points of the running field trip, stored on the phone (SQLite) until the
 * server has them. Survives the app being swiped away, killed or the phone
 * rebooting. Uploaded rows are kept (flag) so the trail can be redrawn, and
 * cleared when the trip is stopped.
 */
public final class FieldTripStore extends SQLiteOpenHelper {

    private static final String DB = "field_trip_points.db";
    private static final int VERSION = 1;
    private static volatile FieldTripStore instance;

    public static final class Point {
        public long id;
        public String clientPointId;
        public double latitude;
        public double longitude;
        public Double accuracy;
        public Double speed;
        public Double heading;
        public String recordedAt;
    }

    public static FieldTripStore get(Context context) {
        if (instance == null) {
            synchronized (FieldTripStore.class) {
                if (instance == null) instance = new FieldTripStore(context.getApplicationContext());
            }
        }
        return instance;
    }

    private FieldTripStore(Context context) {
        super(context, DB, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE points (" +
            "id INTEGER PRIMARY KEY AUTOINCREMENT," +
            "client_point_id TEXT NOT NULL UNIQUE," +
            "latitude REAL NOT NULL," +
            "longitude REAL NOT NULL," +
            "accuracy REAL," +
            "speed REAL," +
            "heading REAL," +
            "recorded_at TEXT NOT NULL," +
            "uploaded INTEGER NOT NULL DEFAULT 0)"
        );
        db.execSQL("CREATE INDEX points_uploaded ON points (uploaded, id)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // v1 only.
    }

    public synchronized void insert(Point p) {
        ContentValues v = new ContentValues();
        v.put("client_point_id", p.clientPointId);
        v.put("latitude", p.latitude);
        v.put("longitude", p.longitude);
        if (p.accuracy != null) v.put("accuracy", p.accuracy);
        if (p.speed != null) v.put("speed", p.speed);
        if (p.heading != null) v.put("heading", p.heading);
        v.put("recorded_at", p.recordedAt);
        getWritableDatabase().insertWithOnConflict("points", null, v, SQLiteDatabase.CONFLICT_IGNORE);
    }

    public synchronized List<Point> pending(int limit) {
        List<Point> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
            "SELECT id, client_point_id, latitude, longitude, accuracy, speed, heading, recorded_at " +
            "FROM points WHERE uploaded = 0 ORDER BY id LIMIT " + limit, null)) {
            while (c.moveToNext()) {
                Point p = new Point();
                p.id = c.getLong(0);
                p.clientPointId = c.getString(1);
                p.latitude = c.getDouble(2);
                p.longitude = c.getDouble(3);
                p.accuracy = c.isNull(4) ? null : c.getDouble(4);
                p.speed = c.isNull(5) ? null : c.getDouble(5);
                p.heading = c.isNull(6) ? null : c.getDouble(6);
                p.recordedAt = c.getString(7);
                out.add(p);
            }
        }
        return out;
    }

    public synchronized void markUploaded(List<Point> points) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (Point p : points) db.execSQL("UPDATE points SET uploaded = 1 WHERE id = ?", new Object[] { p.id });
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public synchronized int count(boolean uploaded) {
        try (Cursor c = getReadableDatabase().rawQuery(
            "SELECT COUNT(*) FROM points WHERE uploaded = ?", new String[] { uploaded ? "1" : "0" })) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    /** Most recent points, oldest first, as [longitude, latitude] pairs. */
    public synchronized List<double[]> trail(int limit) {
        List<double[]> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().rawQuery(
            "SELECT longitude, latitude FROM (SELECT id, longitude, latitude FROM points ORDER BY id DESC LIMIT " +
            limit + ") ORDER BY id", null)) {
            while (c.moveToNext()) out.add(new double[] { c.getDouble(0), c.getDouble(1) });
        }
        return out;
    }

    public synchronized void clear() {
        getWritableDatabase().execSQL("DELETE FROM points");
    }
}
