// backend/handler/maintenanceHandler.go
package handler

import (
	"net/http"
	"time"

	"FleetDrive/backend/model"
	"FleetDrive/backend/repository"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MaintenanceHandler repräsentiert den Handler für Wartungs-Operationen
type MaintenanceHandler struct {
	maintenanceRepo *repository.MaintenanceRepository
	vehicleRepo     *repository.VehicleRepository
}

// NewMaintenanceHandler erstellt einen neuen MaintenanceHandler
func NewMaintenanceHandler() *MaintenanceHandler {
	return &MaintenanceHandler{
		maintenanceRepo: repository.NewMaintenanceRepository(),
		vehicleRepo:     repository.NewVehicleRepository(),
	}
}

// CreateMaintenanceRequest repräsentiert die Anfrage zum Erstellen eines Wartungseintrags
type CreateMaintenanceRequest struct {
	VehicleID string                `json:"vehicleId" binding:"required"`
	Date      string                `json:"date" binding:"required"`
	Type      model.MaintenanceType `json:"type" binding:"required"`
	Mileage   int                   `json:"mileage" binding:"required"`
	Cost      float64               `json:"cost" binding:"required"`
	Workshop  string                `json:"workshop"`
	Notes     string                `json:"notes"`
}

// GetMaintenanceEntries behandelt die Anfrage, alle Wartungseinträge abzurufen
func (h *MaintenanceHandler) GetMaintenanceEntries(c *gin.Context) {
	entries, err := h.maintenanceRepo.FindAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fehler beim Abrufen der Wartungseinträge"})
		return
	}

	// Fahrzeugdetails anreichern
	type MaintenanceWithVehicle struct {
		*model.Maintenance
		VehicleName string `json:"vehicleName"`
	}

	var result []MaintenanceWithVehicle
	for _, entry := range entries {
		mwv := MaintenanceWithVehicle{Maintenance: entry}

		// Fahrzeugdetails abrufen
		vehicle, err := h.vehicleRepo.FindByID(entry.VehicleID.Hex())
		if err == nil {
			mwv.VehicleName = vehicle.Brand + " " + vehicle.Model + " (" + vehicle.LicensePlate + ")"
		}

		result = append(result, mwv)
	}

	c.JSON(http.StatusOK, gin.H{"maintenance": result})
}

// GetVehicleMaintenanceEntries behandelt die Anfrage, alle Wartungseinträge für ein Fahrzeug abzurufen
func (h *MaintenanceHandler) GetVehicleMaintenanceEntries(c *gin.Context) {
	vehicleID := c.Param("vehicleId")

	// Prüfen, ob das Fahrzeug existiert
	vehicle, err := h.vehicleRepo.FindByID(vehicleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Fahrzeug nicht gefunden"})
		return
	}

	entries, err := h.maintenanceRepo.FindByVehicle(vehicleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fehler beim Abrufen der Wartungseinträge"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"vehicle":     vehicle,
		"maintenance": entries,
	})
}

// GetMaintenanceEntry behandelt die Anfrage, einen Wartungseintrag anhand seiner ID abzurufen
func (h *MaintenanceHandler) GetMaintenanceEntry(c *gin.Context) {
	id := c.Param("id")

	entry, err := h.maintenanceRepo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Wartungseintrag nicht gefunden"})
		return
	}

	// Fahrzeugdetails abrufen
	vehicle, err := h.vehicleRepo.FindByID(entry.VehicleID.Hex())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fahrzeug nicht gefunden"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"maintenance": entry,
		"vehicle":     vehicle,
	})
}

// CreateMaintenanceEntry behandelt die Anfrage, einen neuen Wartungseintrag zu erstellen
func (h *MaintenanceHandler) CreateMaintenanceEntry(c *gin.Context) {
	var req CreateMaintenanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Prüfen, ob das Fahrzeug existiert
	vehicleID, err := primitive.ObjectIDFromHex(req.VehicleID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ungültige Fahrzeug-ID"})
		return
	}

	vehicle, err := h.vehicleRepo.FindByID(req.VehicleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Fahrzeug nicht gefunden"})
		return
	}

	// Datum parsen
	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ungültiges Datum"})
		return
	}

	// Neuen Wartungseintrag erstellen
	entry := &model.Maintenance{
		VehicleID: vehicleID,
		Date:      date,
		Type:      req.Type,
		Mileage:   req.Mileage,
		Cost:      req.Cost,
		Workshop:  req.Workshop,
		Notes:     req.Notes,
	}

	// Wartungseintrag in der Datenbank speichern
	if err := h.maintenanceRepo.Create(entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fehler beim Erstellen des Wartungseintrags"})
		return
	}

	// Kilometerstand des Fahrzeugs aktualisieren, wenn der Eintrag einen höheren Wert hat
	if req.Mileage > vehicle.Mileage {
		vehicle.Mileage = req.Mileage
		if err := h.vehicleRepo.Update(vehicle); err != nil {
			// Kein kritischer Fehler, nur loggen
			// log.Printf("Fehler beim Aktualisieren des Kilometerstands: %v", err)
		}
	}

	c.JSON(http.StatusCreated, gin.H{"maintenance": entry})
}

// UpdateMaintenanceEntry behandelt die Anfrage, einen Wartungseintrag zu aktualisieren
func (h *MaintenanceHandler) UpdateMaintenanceEntry(c *gin.Context) {
	id := c.Param("id")

	// Wartungseintrag aus der Datenbank abrufen
	entry, err := h.maintenanceRepo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Wartungseintrag nicht gefunden"})
		return
	}

	var req CreateMaintenanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Prüfen, ob das Fahrzeug existiert, falls es geändert wurde
	var vehicleID primitive.ObjectID
	if req.VehicleID != entry.VehicleID.Hex() {
		var err error
		vehicleID, err = primitive.ObjectIDFromHex(req.VehicleID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ungültige Fahrzeug-ID"})
			return
		}

		_, err = h.vehicleRepo.FindByID(req.VehicleID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Fahrzeug nicht gefunden"})
			return
		}

		entry.VehicleID = vehicleID
	}

	// Datum parsen, wenn vorhanden
	if req.Date != "" {
		date, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ungültiges Datum"})
			return
		}
		entry.Date = date
	}

	// Wartungseintrag aktualisieren
	entry.Type = req.Type
	entry.Mileage = req.Mileage
	entry.Cost = req.Cost
	entry.Workshop = req.Workshop
	entry.Notes = req.Notes

	// Wartungseintrag in der Datenbank aktualisieren
	if err := h.maintenanceRepo.Update(entry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fehler beim Aktualisieren des Wartungseintrags"})
		return
	}

	// Kilometerstand des Fahrzeugs aktualisieren, wenn der Eintrag einen höheren Wert hat
	vehicle, err := h.vehicleRepo.FindByID(entry.VehicleID.Hex())
	if err == nil && req.Mileage > vehicle.Mileage {
		vehicle.Mileage = req.Mileage
		h.vehicleRepo.Update(vehicle)
	}

	c.JSON(http.StatusOK, gin.H{"maintenance": entry})
}

// DeleteMaintenanceEntry behandelt die Anfrage, einen Wartungseintrag zu löschen
func (h *MaintenanceHandler) DeleteMaintenanceEntry(c *gin.Context) {
	id := c.Param("id")

	// Prüfen, ob der Wartungseintrag existiert
	_, err := h.maintenanceRepo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Wartungseintrag nicht gefunden"})
		return
	}

	// Wartungseintrag aus der Datenbank löschen
	if err := h.maintenanceRepo.Delete(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fehler beim Löschen des Wartungseintrags"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Wartungseintrag erfolgreich gelöscht"})
}
